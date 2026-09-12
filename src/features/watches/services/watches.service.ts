import "server-only";

import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { PRICE_WATCH_JOB } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { extractPrepared, prepareProductUrl } from "@/features/extraction/extraction.service";
import { priceExtraction } from "@/features/extraction/quote.service";
import {
  deletePriceWatch,
  getWatchById,
  getWatchByUserAndHash,
  insertPriceObservation,
  insertPriceWatch,
  listActiveWatchesByUser,
  listRetiredWatchesByUser,
  listObservationsForWatch,
  listObservationsForWatches,
  listWatchesDueForCheck,
  markWatchChecked,
  markWatchFailed,
  reactivatePriceWatch,
  type PriceObservationRow,
  type PriceWatchRow,
} from "@/db/queries/price-watches";
import { clampHistoryDays } from "../schema";
import { deriveWatchStats, emptyWatchStats } from "./watch-stats";
import type {
  CreateWatchResult,
  DeleteWatchResult,
  PriceObservation,
  PriceWatch,
  PriceWatchJobSummary,
  WatchHistoryResponse,
  WatchListResponse,
} from "../types";

/**
 * Price-watch business logic. Knows nothing about Request/Response — routes do
 * auth, parsing and status codes; this decides what is true.
 *
 * TRUST BOUNDARY. A client may send one thing: a product URL. Everything
 * stored — the canonical URL, its hash, the product name and image, the USD
 * price, the GH₵ total and the exchange rate — is produced here, from the same
 * extraction chain and the same `calculatePricing` the quote flow uses. There
 * is deliberately no code path that accepts a price from the browser, because a
 * watch that believed the client could be seeded with a fake baseline and then
 * report an invented "↓ $400 this week".
 */

/** Window the Home card's stats are derived over. */
const STATS_WINDOW_DAYS = 30;

// ── Read ────────────────────────────────────────────────────────────────────

/**
 * The caller's active watches with their derived stats. One query for the
 * watches and one for every series, then the stats are computed in memory —
 * this runs on a page load, so it may not be N+1.
 */
/**
 * Whether a signed-in customer has an active watch on this product. False for
 * visitors. Decorates a quote, so a flaky read degrades to false with a warning
 * rather than failing the quote; a missing table still surfaces.
 */
export async function isWatching(userId: string | null, urlHash: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const watch = await getWatchByUserAndHash(userId, urlHash);
    return watch?.is_active === true;
  } catch (err) {
    if (isSchemaMissingError(err)) throw err;
    logger.warn("isWatching failed; reporting not watching", { urlHash, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export async function listWatches(userId: string): Promise<WatchListResponse> {
  const [rows, retiredRows] = await Promise.all([
    listActiveWatchesByUser(userId),
    listRetiredWatchesByUser(userId),
  ]);

  // Watches the job gave up on. They are reported separately from the active
  // list rather than dropped, because a watch that silently stops being checked
  // leaves the customer believing a price is still being tracked.
  const retired = retiredRows.map((row) => ({
    watch: toApiWatch(row),
    last_error: row.last_error,
  }));

  if (rows.length === 0) {
    return { watches: [], watching_count: 0, retired };
  }

  const observations = await listObservationsForWatches(
    rows.map((r) => r.id),
    sinceIso(STATS_WINDOW_DAYS),
  );
  const byWatch = groupByWatch(observations);

  return {
    watches: rows.map((row) => ({
      watch: toApiWatch(row),
      stats: deriveWatchStats(byWatch.get(row.id) ?? []),
    })),
    watching_count: rows.length,
    retired,
  };
}

/**
 * One watch's series for the sparkline. Ownership is checked here and a
 * stranger's id answers 404, not 403 — 403 would confirm the id exists.
 */
export async function getWatchHistory(
  userId: string,
  watchId: string,
  days: number,
): Promise<WatchHistoryResponse> {
  const row = await requireOwnedWatch(userId, watchId);
  const window = clampHistoryDays(days);
  const rows = await listObservationsForWatch(row.id, sinceIso(window));
  const observations = rows.map(toApiObservation);

  return {
    watch_id: row.id,
    days: window,
    observations,
    stats: observations.length > 0 ? deriveWatchStats(observations) : emptyWatchStats(),
  };
}

// ── Write ───────────────────────────────────────────────────────────────────

/**
 * Start watching a product.
 *
 * Idempotent against `UNIQUE (user_id, url_hash)`: pasting a link that is
 * already watched returns the existing watch rather than failing, and a watch
 * the customer had removed (or the job had retired) is re-armed with a fresh
 * baseline. The first observation is appended immediately so the card has a
 * current price the same second, rather than an empty row until tomorrow's job.
 */
export async function createWatch(userId: string, rawUrl: string): Promise<CreateWatchResult> {
  const resolved = await resolveAndPrice(rawUrl, userId);
  const existing = await getWatchByUserAndHash(userId, resolved.urlHash);

  if (existing?.is_active) {
    // Already watching: record the fresh reading, don't move the baseline.
    await appendObservation(existing.id, resolved);
    await markWatchChecked(existing.id, {
      last_price_usd: resolved.priceUsd,
      last_total_ghs: resolved.totalGhs,
      extraction_cache_id: resolved.extractionCacheId,
      product_name: resolved.productName,
      product_image_url: resolved.productImageUrl,
      checked_at: resolved.checkedAt,
    });
    const refreshed = (await getWatchById(existing.id)) ?? existing;
    return { ...(await withStats(refreshed)), created: false };
  }

  const seed = {
    product_url: resolved.canonicalUrl,
    product_name: resolved.productName,
    product_image_url: resolved.productImageUrl,
    extraction_cache_id: resolved.extractionCacheId,
    baseline_price_usd: resolved.priceUsd,
    baseline_total_ghs: resolved.totalGhs,
    last_price_usd: resolved.priceUsd,
    last_total_ghs: resolved.totalGhs,
    last_checked_at: resolved.checkedAt,
  };

  const watch = existing
    ? await reactivatePriceWatch(existing.id, seed)
    : await insertPriceWatch({ ...seed, user_id: userId, url_hash: resolved.urlHash });

  await appendObservation(watch.id, resolved);

  await logAuditEvent({
    actorId: userId,
    actorRole: "user",
    action: existing ? "price_watch_reactivated" : "price_watch_created",
    entityType: "price_watch",
    entityId: watch.id,
    metadata: {
      product_url: resolved.canonicalUrl,
      baseline_price_usd: resolved.priceUsd,
      baseline_total_ghs: resolved.totalGhs,
      exchange_rate: resolved.exchangeRate,
    },
  });

  return { ...(await withStats(watch)), created: true };
}

/** Remove a watch. Observations cascade. 404 for anything the caller doesn't own. */
export async function deleteWatch(userId: string, watchId: string): Promise<DeleteWatchResult> {
  const row = await requireOwnedWatch(userId, watchId);
  await deletePriceWatch(row.id);

  await logAuditEvent({
    actorId: userId,
    actorRole: "user",
    action: "price_watch_deleted",
    entityType: "price_watch",
    entityId: row.id,
    metadata: { product_url: row.product_url },
  });

  return { id: row.id, deleted: true };
}

// ── Nightly job ─────────────────────────────────────────────────────────────

/**
 * Re-check the watches that have gone longest without one.
 *
 * COST. Every check is a full extraction, which is the most scraper-credit
 * -hungry thing the platform does, so the run is capped at
 * `PRICE_WATCH_JOB.maxPerRun` and runs `concurrency` at a time. The claim is
 * ordered oldest-check-first (`idx_price_watches_due`), so the cap lengthens the
 * cycle instead of starving anyone: with 600 watches and a cap of 200, every
 * watch is still checked every third night.
 *
 * BACKOFF. A failure bumps `consecutive_failures` and stamps `last_checked_at`
 * anyway — without that stamp a dead URL stays at the head of the queue and
 * eats the whole budget every night. At `maxConsecutiveFailures` the watch is
 * deactivated: a delisted product stops costing money and the customer can see
 * `last_error`.
 *
 * A single watch never fails the run. A MISSING TABLE does — that is a deploy
 * ordering bug, not a bad link, and it must be loud.
 */
export async function runPriceWatchJob(): Promise<PriceWatchJobSummary> {
  const due = await listWatchesDueForCheck(PRICE_WATCH_JOB.maxPerRun);
  const summary: PriceWatchJobSummary = { checked: due.length, updated: 0, failed: 0, deactivated: 0 };
  if (due.length === 0) return summary;

  const outcomes = await mapWithConcurrency(due, PRICE_WATCH_JOB.concurrency, checkOneWatch);
  for (const outcome of outcomes) {
    if (outcome.ok) summary.updated++;
    else summary.failed++;
    if (outcome.deactivated) summary.deactivated++;
  }

  await logAuditEvent({
    actorId: null,
    actorRole: "system",
    action: "price_watch_job_run",
    entityType: "job",
    entityId: null,
    metadata: { ...summary },
  });

  logger.info("price-watch job: done", { ...summary });
  return summary;
}

interface CheckOutcome {
  ok: boolean;
  deactivated: boolean;
}

async function checkOneWatch(watch: PriceWatchRow): Promise<CheckOutcome> {
  try {
    const resolved = await resolveAndPrice(watch.product_url, null);
    await appendObservation(watch.id, resolved);
    await markWatchChecked(watch.id, {
      last_price_usd: resolved.priceUsd,
      last_total_ghs: resolved.totalGhs,
      extraction_cache_id: resolved.extractionCacheId,
      // Keep the stored snapshot if this run couldn't read a title/image.
      product_name: resolved.productName ?? watch.product_name,
      product_image_url: resolved.productImageUrl ?? watch.product_image_url,
      checked_at: resolved.checkedAt,
    });
    // NOTE: `notify_on_drop` is honoured by the notifications feature, not
    // here — the drop is already derivable from the series this appends.
    return { ok: true, deactivated: false };
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;

    const failures = watch.consecutive_failures + 1;
    const deactivated = failures >= PRICE_WATCH_JOB.maxConsecutiveFailures;
    const message = error instanceof Error ? error.message : String(error);

    logger.warn("price-watch job: check failed", {
      watchId: watch.id,
      failures,
      deactivated,
      error: message,
    });

    try {
      await markWatchFailed(watch.id, {
        consecutive_failures: failures,
        last_error: message,
        is_active: !deactivated,
        checked_at: new Date().toISOString(),
      });
    } catch (writeError) {
      if (isSchemaMissingError(writeError)) throw writeError;
      logger.error("price-watch job: could not record failure", {
        watchId: watch.id,
        error: writeError instanceof Error ? writeError.message : String(writeError),
      });
    }

    return { ok: false, deactivated };
  }
}

/** Fixed-size worker pool — `Promise.all` over 200 extractions would not end well. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await worker(item);
    }
  });

  await Promise.all(runners);
  return results;
}

// ── Shared resolution ───────────────────────────────────────────────────────

interface ResolvedProduct {
  canonicalUrl: string;
  urlHash: string;
  productName: string | null;
  productImageUrl: string | null;
  extractionCacheId: string | null;
  priceUsd: number;
  totalGhs: number;
  exchangeRate: number;
  checkedAt: string;
}

/**
 * Canonicalise → extract → price, with the SAME url normalisation
 * `extraction_cache` is keyed by (`prepareProductUrl` → `hashUrl`), so a watch
 * and a quote for the same link share one cache row and one hash.
 *
 * Quantity is 1: a watch tracks a product's price, not an order. `item_price_usd`
 * is the store price converted to USD — the FX-free number every trend is built
 * on — while `total_ghs` and `exchange_rate` come from the same breakdown so
 * the pair is always internally consistent.
 */
async function resolveAndPrice(rawUrl: string, userId: string | null): Promise<ResolvedProduct> {
  const prepared = await prepareProductUrl(rawUrl);
  const extraction = await extractPrepared(prepared, userId);
  const { pricing, reason } = await priceExtraction(extraction, 1, null, null);

  if (!pricing) {
    throw new APIError(422, reason ?? "We couldn't price that product right now.");
  }

  return {
    canonicalUrl: prepared.canonicalUrl,
    urlHash: prepared.urlHash,
    productName: extraction.product.title,
    productImageUrl: extraction.product.image,
    extractionCacheId: extraction.extraction_cache_id ?? null,
    priceUsd: pricing.item_price_usd,
    totalGhs: pricing.total_ghs,
    exchangeRate: pricing.exchange_rate,
    checkedAt: new Date().toISOString(),
  };
}

async function appendObservation(watchId: string, resolved: ResolvedProduct): Promise<void> {
  await insertPriceObservation({
    watch_id: watchId,
    price_usd: resolved.priceUsd,
    total_ghs: resolved.totalGhs,
    exchange_rate: resolved.exchangeRate,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireOwnedWatch(userId: string, watchId: string): Promise<PriceWatchRow> {
  const row = await getWatchById(watchId);
  if (!row || row.user_id !== userId) throw new APIError(404, "Watch not found");
  return row;
}

async function withStats(row: PriceWatchRow) {
  const observations = await listObservationsForWatch(row.id, sinceIso(STATS_WINDOW_DAYS));
  return { watch: toApiWatch(row), stats: deriveWatchStats(observations.map(toApiObservation)) };
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function groupByWatch(rows: PriceObservationRow[]): Map<string, PriceObservation[]> {
  const map = new Map<string, PriceObservation[]>();
  for (const row of rows) {
    const list = map.get(row.watch_id);
    if (list) list.push(toApiObservation(row));
    else map.set(row.watch_id, [toApiObservation(row)]);
  }
  return map;
}

/** Drop internals (user_id, url_hash, failure bookkeeping) on the way out. */
function toApiWatch(row: PriceWatchRow): PriceWatch {
  return {
    id: row.id,
    product_url: row.product_url,
    product_name: row.product_name,
    product_image_url: row.product_image_url,
    baseline_price_usd: numberOrNull(row.baseline_price_usd),
    baseline_total_ghs: numberOrNull(row.baseline_total_ghs),
    last_price_usd: numberOrNull(row.last_price_usd),
    last_total_ghs: numberOrNull(row.last_total_ghs),
    last_checked_at: row.last_checked_at,
    notify_on_drop: row.notify_on_drop,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

/** Postgres NUMERIC arrives as a string over PostgREST often enough to matter. */
function toApiObservation(row: PriceObservationRow): PriceObservation {
  return {
    price_usd: Number(row.price_usd),
    total_ghs: Number(row.total_ghs),
    exchange_rate: Number(row.exchange_rate),
    observed_at: row.observed_at,
  };
}

function numberOrNull(value: number | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
