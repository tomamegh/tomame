import "server-only";

import {
  claimExtractionRequest,
  completeExtractionRequest,
  enqueueExtractionRequest,
  findExtractionRequestByUrl,
  giveUpStuckExtractionRequests,
  hasOpenRecheck,
  listQueuedExtractionRequests,
  reclaimStaleExtractionRequests,
  requeueExtractionRequest,
  type ExtractionJobRow,
  type RequestViewer,
} from "@/db/queries/extraction-requests";
import { getCachedExtractionByHash } from "@/db/queries/extraction-cache";
import { EXTRACTION } from "@/config/extraction";
import { STORES } from "../stores";
import { logger } from "@/lib/logger";
import { extractPrepared, prepareProductUrl } from "../extraction.service";
import { storeSaysUnavailable } from "../stock-signals";
import type { ExtractionResult } from "../types";
import { notifyPasteFinished, type PasteFinishedResult } from "./paste-notify.service";
import { enqueueCatalogQueryFromPaste } from "@/features/catalog/services/catalog-enqueue.service";
import { settlePasteOutcome, settleUnsettledPastes } from "./paste-outcome.service";

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
export const STALE_RUNNING_MS = Math.max(EXTRACTION.totalBudgetMs, ...STORES.map((s) => s.budgetMs ?? 0)) + 35_000;

/** The longest one read may take, across stores (SHEIN 60 s). */
const MAX_CHAIN_MS = STALE_RUNNING_MS - 35_000;

/**
 * No paste reads for longer than this from when the customer asked (106
 * `queued_at`): past it a first read fails with "Ask a buyer" and a re-check
 * settles on the figures it had. Covers the slowest legitimate path — a 60 s
 * read, the 45 s retry delay plus a sweep minute, a second 60 s read.
 */
export const PASTE_GIVE_UP_MS = 5 * 60_000;

/** A cached read older than the freshness window is re-read on a re-paste. Unknown age: not stale. */
export function isStaleRead(result: Pick<ExtractionResult, "fetched_at"> | null | undefined, now = Date.now()): boolean {
  const at = Date.parse(result?.fetched_at ?? "");
  return Number.isFinite(at) && now - at > EXTRACTION.repasteFreshMs;
}

export interface EnqueuedPaste {
  request: ExtractionJobRow;
  /** True when the row was already answered by the product-keyed cache — nothing to run. */
  ready: boolean;
  /** A stale cached read is being read again; its old figures show meanwhile (106). */
  rechecking: boolean;
}

/**
 * Put a pasted link on the queue.
 *
 * A product-keyed cache hit is already the answer (migration 035: one extraction
 * is shared by every customer who pastes the same URL), so it is recorded `ready`
 * and no job is ever scheduled — a repeat paste stays instant and costs no vendor
 * call. The URL is canonicalised first so two spellings of one product share a row.
 */
/** Thrown when the caller's `admit` gate refuses a paste (the route's rate limit). */
export class PasteNotAdmittedError extends Error {
  constructor(readonly cacheHit: boolean) {
    super("Paste not admitted");
    this.name = "PasteNotAdmittedError";
  }
}

/**
 * `admit` runs after the cache lookup and before anything is written, so the
 * caller can budget a fresh read (a vendor call) apart from a cache hit (free).
 */
export async function enqueuePaste(
  viewer: RequestViewer,
  rawUrl: string,
  admit?: (cacheHit: boolean) => Promise<boolean>,
): Promise<EnqueuedPaste | null> {
  const prepared = await prepareProductUrl(rawUrl);
  const cached = await getCachedExtractionByHash(prepared.urlHash);
  // A stale read is re-read: that is a vendor call and spends the read budget.
  // Refused, the customer still gets the old read, as the cache hit it is.
  let recheck = cached != null && isStaleRead(cached.result);
  if (admit) {
    if (recheck) recheck = await admit(false);
    const fresh = !cached || recheck;
    // A stale read served as-is (its re-read refused) is a cache hit like any other.
    if (!(recheck || (await admit(!fresh)))) throw new PasteNotAdmittedError(!fresh);
  }

  const request = await enqueueExtractionRequest({
    viewer,
    urlHash: prepared.urlHash,
    productUrl: prepared.canonicalUrl,
    cachedId: cached?.id ?? null,
    recheck,
  });
  if (!request) return null;

  const open = request.status === "pending" || request.status === "running";
  const ready = request.status === "ready" && !!request.extraction_cache_id;
  // A cache hit is settled on the spot (110): priced, or handed to a buyer.
  if (ready && !request.outcome) await settlePasteOutcome(request, { status: "ready", extractionCacheId: request.extraction_cache_id! });
  return { request, ready, rechecking: open && !!request.extraction_cache_id };
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
export async function runExtractionJob(requestId: string): Promise<"ran" | "skipped" | "failed" | "retry"> {
  const claimed = await claimExtractionRequest(requestId);
  if (!claimed) return "skipped";

  const attempts = claimed.attempts + 1;
  // A pending row that names an extraction is a re-check of a stale read (106):
  // the store is read again, and the old figures stand if it reads nothing.
  const recheck = claimed.extraction_cache_id != null;

  // What the customer should be told, decided inside the try/catch and acted on
  // AFTER it. Null means the job has not settled — it is going round again, and
  // there is nothing to report yet.
  let finished: PasteFinishedResult | null = null;
  let outcome: "ran" | "failed" | "retry";
  // The freight check the extraction left pending, run once the job has settled.
  let checkFreight: (() => Promise<void>) | undefined;

  try {
    const prepared = await prepareProductUrl(claimed.product_url);
    // A retry or a re-check must not be answered by the read it is replacing.
    const extraction = await extractPrepared(prepared, { userId: claimed.user_id, sessionId: claimed.session_id }, { fresh: recheck || claimed.attempts > 0 });

    if (readNothing(extraction) && !recheck && attempts < 2) {
      // Every tier failed (a vendor moment, a timeout): read once more after a
      // pause before telling the customer we couldn't. The row stays "reading".
      await requeueExtractionRequest(claimed.id, attempts, new Date(Date.now() + EXTRACTION.failedReadRetryMs));
      logger.info("extraction job: nothing read, retrying once", { id: claimed.id, url: claimed.product_url });
      outcome = "retry";
    } else if (!extraction.extraction_cache_id) {
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
      checkFreight = extraction.checkFreight;
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
  // A first read records how it ended (110). A no-price ending is answered from
  // the catalogue's last check or handed to a buyer, and the customer is told
  // THAT, not "we couldn't read it". A re-check keeps the outcome it had.
  if (finished && !recheck) finished = await settlePasteOutcome(claimed, finished);

  // A re-check is not news to announce: the customer is looking at the quote.
  if (finished) {
    try {
      if (!recheck) await notifyPasteFinished(claimed, finished);
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
      // The quote is already ready and says its freight is being checked; the
      // check settles it here (the queue never runs the slow tiers). It holds
      // payment only until it answers, and a lost run goes stale and is retried
      // on the next read, so a failure here changes nothing about the job.
      try {
        await checkFreight?.();
      } catch (error) {
        logger.error("freight check threw after the job had already settled", {
          id: claimed.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        if (!recheck) await enqueueCatalogQueryFromPaste(finished.extractionCacheId);
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
  /** Includes jobs sent round for their one retry. */
  failed: number;
  /** Pastes ended for waiting past `PASTE_GIVE_UP_MS`; present only when some were. */
  gaveUp?: number;
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
  // Nothing reads forever: past the give-up window a paste ends (106).
  const gaveUp = await giveUpStuckExtractionRequests(PASTE_GIVE_UP_MS);
  // Give-up failures and any lost inline settle get their outcome here (110).
  await settleUnsettledPastes();
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

  return { reclaimed, claimed, ran, failed, ...(gaveUp ? { gaveUp } : {}) };
}

/**
 * The paste route's background run: the job, and when every tier failed, its
 * one retry after the pause — in this same invocation when the function has
 * room for it (a 60 s store's two reads plus the pause), else the sweep runs
 * it once `not_before` passes.
 */
export async function runPasteJob(requestId: string, functionBudgetMs: number): Promise<void> {
  const started = Date.now();
  if ((await runExtractionJob(requestId)) !== "retry") return;
  const room = functionBudgetMs - (Date.now() - started) - EXTRACTION.failedReadRetryMs - MAX_CHAIN_MS - 5_000;
  if (room < 0) return;
  await new Promise((resolve) => setTimeout(resolve, EXTRACTION.failedReadRetryMs));
  await runExtractionJob(requestId);
}

/** A list read ends this viewer's pastes that waited past the give-up window, so none shows "Reading" forever. */
export async function settleStuckPastes(viewer: RequestViewer): Promise<void> {
  try {
    await giveUpStuckExtractionRequests(PASTE_GIVE_UP_MS, viewer);
  } catch (error) {
    logger.warn("pastes: could not settle stuck rows", { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Whether a fresh read of this extraction is in flight: the quote shows "Re-checking price and stock…". */
export async function isRechecking(extractionCacheId: string): Promise<boolean> {
  try {
    return await hasOpenRecheck(extractionCacheId, PASTE_GIVE_UP_MS);
  } catch {
    return false;
  }
}

/** Every tier failed: no price, and not because the store said it is out of stock. */
function readNothing(extraction: ExtractionResult): boolean {
  const product = extraction.product;
  return !!product && product.price == null && !storeSaysUnavailable(product);
}

/** The viewer's row for a link, for a screen that already knows the URL. */
export async function findPasteByUrl(viewer: RequestViewer, rawUrl: string): Promise<ExtractionJobRow | null> {
  const prepared = await prepareProductUrl(rawUrl);
  return findExtractionRequestByUrl(viewer, prepared.urlHash);
}
