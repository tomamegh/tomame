import "server-only";

import {
  claimExtractionRequest,
  completeExtractionRequest,
  enqueueExtractionRequest,
  findExtractionRequestByUrl,
  listQueuedExtractionRequests,
  reclaimStaleExtractionRequests,
  requeueExtractionRequest,
  type ExtractionJobRow,
  type RequestViewer,
} from "@/db/queries/extraction-requests";
import { getCachedExtractionByHash } from "@/db/queries/extraction-cache";
import { EXTRACTION } from "@/config/extraction";
import { logger } from "@/lib/logger";
import { extractPrepared, prepareProductUrl } from "../extraction.service";

/**
 * The paste queue — extraction as a background job (migration 049).
 *
 * WHY THIS EXISTS. `POST /api/products/extract` used to hold the customer's
 * request open for the chain's whole 25 s budget. A slow store therefore meant a
 * spinner they could not leave, two links could not be read at once, and
 * navigating away aborted the Vercel function and lost the work outright.
 *
 * Now a paste is a row. `enqueuePaste` returns as soon as that row exists, and
 * the caller starts `runExtractionJob` with `after()` so the work begins in the
 * same invocation — no queue latency on the happy path. A pg_cron sweep every
 * minute picks up anything that was dropped mid-flight, which is the promise
 * `after()` alone cannot make.
 *
 * NOTHING HERE THROWS AT THE CUSTOMER. The extractor already degrades to a
 * partial product with `messages`; this layer only records how the attempt went.
 */

/** Give up after this many tries; the customer is offered the describe-it form instead. */
export const MAX_EXTRACTION_ATTEMPTS = 3;

/**
 * A `running` job older than this lost its worker. One chain budget plus a wide
 * margin for the function's own startup and teardown — short enough that a
 * customer who walked away is not waiting on a dead job for long, long enough
 * that a merely slow job is never stolen from a worker that is still alive.
 */
export const STALE_RUNNING_MS = EXTRACTION.totalBudgetMs + 35_000;

export interface EnqueuedPaste {
  request: ExtractionJobRow;
  /** True when the row was already answered by the product-keyed cache — nothing to run. */
  ready: boolean;
}

/**
 * Put a pasted link on the queue.
 *
 * A product-keyed cache hit is already the answer (migration 035: one extraction
 * is shared by every customer who pastes the same URL), so it is recorded `ready`
 * and no job is ever scheduled — a repeat paste stays instant and costs no vendor
 * call. The URL is canonicalised first so two spellings of one product share a row.
 */
export async function enqueuePaste(viewer: RequestViewer, rawUrl: string): Promise<EnqueuedPaste | null> {
  const prepared = await prepareProductUrl(rawUrl);
  const cached = await getCachedExtractionByHash(prepared.urlHash);

  const request = await enqueueExtractionRequest({
    viewer,
    urlHash: prepared.urlHash,
    productUrl: prepared.canonicalUrl,
    cachedId: cached?.id ?? null,
  });
  if (!request) return null;

  return { request, ready: request.status === "ready" && !!request.extraction_cache_id };
}

/**
 * Run one job to completion.
 *
 * Claiming is a guarded `pending → running` transition, so two workers racing for
 * the same row cannot both proceed: the loser's update matches nothing and this
 * returns immediately. That is what makes the `after()` start and the cron sweep
 * safe to overlap — they will, routinely.
 *
 * An extraction that answers without a cache id is a failure from the customer's
 * point of view: there is nothing to price against. It is recorded as one so the
 * screen can offer the describe-it form rather than spin forever.
 */
export async function runExtractionJob(requestId: string): Promise<"ran" | "skipped" | "failed"> {
  const claimed = await claimExtractionRequest(requestId);
  if (!claimed) return "skipped";

  const attempts = claimed.attempts + 1;
  try {
    const prepared = await prepareProductUrl(claimed.product_url);
    const extraction = await extractPrepared(prepared, claimed.user_id);

    if (!extraction.extraction_cache_id) {
      await completeExtractionRequest({
        id: claimed.id,
        status: "failed",
        attempts,
        error: "We read the page but could not save a price for it.",
      });
      return "failed";
    }

    await completeExtractionRequest({
      id: claimed.id,
      status: "ready",
      extractionCacheId: extraction.extraction_cache_id,
      attempts,
    });
    return "ran";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("extraction job failed", { id: claimed.id, url: claimed.product_url, attempts, error: message });

    // Out of attempts is a dead end the customer must be told about; anything
    // else goes back on the queue for the next sweep.
    if (attempts >= MAX_EXTRACTION_ATTEMPTS) {
      await completeExtractionRequest({
        id: claimed.id,
        status: "failed",
        attempts,
        error: "We could not read that page.",
      });
    } else {
      await requeueExtractionRequest(claimed.id, attempts);
    }
    return "failed";
  }
}

export interface SweepSummary {
  reclaimed: number;
  claimed: number;
  ran: number;
  failed: number;
}

/**
 * One sweep: release dead jobs, then run a small batch of queued ones.
 *
 * Sequential, not parallel. Each job is a race across paid vendors that can hold
 * several outbound connections for 25 s; running a batch of them at once inside
 * one Vercel function is how you turn a safety net into an outage. `batchSize`
 * stays small for the same reason, and the whole run is bounded well inside the
 * 300 s function cap.
 */
export async function sweepExtractions(batchSize = 3): Promise<SweepSummary> {
  const reclaimed = await reclaimStaleExtractionRequests(STALE_RUNNING_MS, MAX_EXTRACTION_ATTEMPTS);
  const queued = await listQueuedExtractionRequests(batchSize);

  let ran = 0;
  let failed = 0;
  let claimed = 0;
  for (const job of queued) {
    const outcome = await runExtractionJob(job.id);
    if (outcome === "skipped") continue;
    claimed += 1;
    if (outcome === "ran") ran += 1;
    else failed += 1;
  }

  return { reclaimed, claimed, ran, failed };
}

/** The viewer's row for a link, for a screen that already knows the URL. */
export async function findPasteByUrl(viewer: RequestViewer, rawUrl: string): Promise<ExtractionJobRow | null> {
  const prepared = await prepareProductUrl(rawUrl);
  return findExtractionRequestByUrl(viewer, prepared.urlHash);
}
