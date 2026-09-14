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
import { notifyPasteFinished, type PasteFinishedResult } from "./paste-notify.service";
import { enqueueCatalogQueryFromPaste } from "@/features/catalog/services/catalog-enqueue.service";

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

  // What the customer should be told, decided inside the try/catch and acted on
  // AFTER it. Null means the job has not settled — it is going round again, and
  // there is nothing to report yet.
  let finished: PasteFinishedResult | null = null;
  let outcome: "ran" | "failed";

  try {
    const prepared = await prepareProductUrl(claimed.product_url);
    const extraction = await extractPrepared(prepared, { userId: claimed.user_id, sessionId: claimed.session_id });

    if (!extraction.extraction_cache_id) {
      await completeExtractionRequest({
        id: claimed.id,
        status: "failed",
        attempts,
        error: "We read the page but could not save a price for it.",
      });
      finished = { status: "failed" };
      outcome = "failed";
    } else {
      await completeExtractionRequest({
        id: claimed.id,
        status: "ready",
        extractionCacheId: extraction.extraction_cache_id,
        attempts,
      });
      finished = { status: "ready", extractionCacheId: extraction.extraction_cache_id };
      outcome = "ran";
    }
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
      finished = { status: "failed" };
    } else {
      await requeueExtractionRequest(claimed.id, attempts);
    }
    outcome = "failed";
  }

  // OUTSIDE the try/catch, and that placement is the point.
  //
  // These calls used to sit inside it, immediately after the row had been
  // written `ready`. `notifyPasteFinished` rethrows `isSchemaMissingError` — by
  // design, so a deploy that runs ahead of its migrations is loud — and that
  // throw landed in the catch above, which logged "extraction job failed" about
  // an extraction that had just SUCCEEDED and then called
  // `requeueExtractionRequest`, resetting a finished row back to `pending`. The
  // product would be extracted again, at a second vendor charge, the customer's
  // row would flip from priced back to reading, and after three rounds it would
  // settle as "We could not read that page" — a lie about a page that read
  // perfectly. A message we could not send must never undo work we did.
  //
  // The missing table is still reported, at error level, because the job's
  // state is already correct by this point and re-running it cannot fix a
  // schema problem.
  if (finished) {
    try {
      await notifyPasteFinished(claimed, finished);
    } catch (error) {
      logger.error("paste notification failed after the job had already settled", {
        id: claimed.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // The catalogue learns from the paste (055), in the same safe position and
    // for the same reason. This does NOT call a vendor: it records a search term
    // for the hourly budget-capped scrape job to spend a call on later, so the
    // next customer who wants something similar finds it already priced. It
    // swallows its own failures and cannot throw, but it is wrapped anyway
    // because the rule this block exists to enforce is that nothing after the
    // job has settled may change its outcome, and that rule should not depend
    // on a service in another feature keeping its promise.
    if (finished.status === "ready") {
      try {
        await enqueueCatalogQueryFromPaste(finished.extractionCacheId);
      } catch (error) {
        logger.error("catalogue enqueue threw after the job had already settled", {
          id: claimed.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return outcome;
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
