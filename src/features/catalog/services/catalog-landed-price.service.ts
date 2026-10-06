import "server-only";
import { logger } from "@/lib/logger";
import {
  listCatalogRowsNeedingLandedPrice,
  readOldestLandedPriceStamp,
  writeCatalogLandedPrices,
} from "@/db/queries/catalog";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { strikeLandedFigure, type LandedDecline } from "./catalog-search.service";

/**
 * The stored landed price the shop filters and sorts on (migration 080).
 *
 * WHY STORE IT. The landed cedi total is the number a customer shops by — "under
 * GH₵1,000", "cheapest first" — and it is not the store's price: freight is per
 * category (a flat group rate, a fixed-freight item, a weight expression), the
 * fee is tiered, and a row the engine declines has no total at all. Ordering by
 * `price_usd` would put a $40 TV (heavy freight) ahead of a $45 pair of earbuds
 * (light freight) that lands cheaper. And Postgres cannot order by a number it
 * has never seen, so the calculator's figure is written back to the row.
 *
 * THE CALCULATOR STRIKES IT. Every stored figure comes from `strikeLandedTotal`,
 * the same call that prices a card, so the rules still live only in
 * `src/lib/pricing/calculator.ts`. SQL only compares.
 *
 * HOW FRESH. A row is re-priced when it has never been (`landed_priced_at` is
 * null — new rows, and every row the scraper re-reads) or when its figure is
 * older than `CATALOG_LANDED_PRICE.maxAgeMinutes`. FX and the admin's pricing
 * constants can move inside that window, so for up to that long the ORDER can
 * lag the live figure; the cards themselves are always priced live at render.
 */
export const CATALOG_LANDED_PRICE = {
  /** A stored figure older than this is refreshed on the next shop render (after the response). */
  maxAgeMinutes: 60,
  /** Rows per refresh: PostgREST's max-rows, and seconds of arithmetic at most. */
  batchSize: 1000,
} as const;

export type LandedPriceFreshness = "fresh" | "stale" | "missing" | "empty";

/** Whether the stored figures can be trusted for this render. One indexed read. */
export async function readLandedPriceFreshness(now: Date = new Date()): Promise<LandedPriceFreshness> {
  const oldest = await readOldestLandedPriceStamp();
  if (oldest === undefined) return "empty";
  if (oldest === null) return "missing";
  const ageMs = now.getTime() - new Date(oldest).getTime();
  return ageMs > CATALOG_LANDED_PRICE.maxAgeMinutes * 60_000 ? "stale" : "fresh";
}

export interface LandedPriceRefreshSummary {
  considered: number;
  priced: number;
  declined: number;
  /** Of the declined, how many only lack a weight. */
  needs_weight: number;
  written: number;
}

/**
 * Re-strike every row that is missing a figure or holding an old one, with ONE
 * calculator instance (constants, category map, fixed-freight list and FX load
 * once). Idempotent: two overlapping runs write the same numbers.
 */
let inflight: Promise<LandedPriceRefreshSummary> | null = null;

/**
 * One refresh per instance at a time: every shop render that finds the prices
 * stale schedules one, and concurrent runs over the same rows waited on each
 * other's locks until the statement timeout.
 */
export function refreshCatalogLandedPrices(now: Date = new Date()): Promise<LandedPriceRefreshSummary> {
  inflight ??= runLandedPriceRefresh(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runLandedPriceRefresh(now: Date): Promise<LandedPriceRefreshSummary> {
  const staleBefore = new Date(now.getTime() - CATALOG_LANDED_PRICE.maxAgeMinutes * 60_000);
  const rows = await listCatalogRowsNeedingLandedPrice({
    staleBeforeIso: staleBefore.toISOString(),
    limit: CATALOG_LANDED_PRICE.batchSize,
  });
  const summary: LandedPriceRefreshSummary = { considered: rows.length, priced: 0, declined: 0, needs_weight: 0, written: 0 };
  if (rows.length === 0) return summary;

  const calculator = await loadPricingCalculator();
  const figures: { id: string; landed_ghs: number | null; decline: LandedDecline | null }[] = [];
  // Sequential on purpose: the first `calculate` lazily loads the FX rate onto
  // the instance and a parallel burst would race that load.
  for (const row of rows) {
    const { breakdown, decline } = await strikeLandedFigure(calculator, row);
    if (breakdown) summary.priced += 1;
    else summary.declined += 1;
    if (decline === "needs_weight") summary.needs_weight += 1;
    // A declined row is stamped too, with no figure and the reason: "we tried
    // and the engine said no" is an answer, and leaving it null would re-price
    // it every render. The reason is what the weight enrichment and the
    // clean-up (084) read.
    figures.push({ id: row.id, landed_ghs: breakdown ? breakdown.total_ghs : null, decline });
  }

  summary.written = await writeCatalogLandedPrices(figures);
  logger.info("catalog-landed-price: refreshed", { ...summary });
  return summary;
}
