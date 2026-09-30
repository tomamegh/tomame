import "server-only";
import { logger } from "@/lib/logger";
import { CATALOG_ENRICH, CATALOG_STORES, type CatalogStore } from "@/config/catalog";
import {
  claimCatalogEnrichment,
  writeCatalogLandedPrices,
  writeCatalogProductWeight,
  type CatalogEnrichmentRow,
} from "@/db/queries/catalog";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { fetchAmazonProductStructured, fetchEbayProductStructured, isScraperApiConfigured } from "@/lib/scraperapi/client";
import { fetchOxylabsAmazonProduct, fetchOxylabsWalmartProduct, isOxylabsConfigured } from "@/lib/oxylabs/client";
import { fetchZyteProduct, isZyteConfigured } from "@/lib/zyte/client";
import { mapScraperApiAmazon, mapScraperApiEbay } from "@/features/extraction/resolvers/scraperapi.resolver";
import { mapOxylabsAmazon, mapOxylabsWalmart, walmartProductIdOf } from "@/features/extraction/resolvers/oxylabs.resolver";
import { mapZyteProduct } from "@/features/extraction/resolvers/zyte.resolver";
import { amazonAsinOf, ebayItemIdOf } from "@/features/extraction/url";
import { budgetPeriodOf, readJobBudget, spendJobBudget } from "./catalog-budget";
import { strikeLandedFigure } from "./catalog-search.service";

/**
 * Weight enrichment (084).
 *
 * A search result carries no weight, so a product in a weight-priced group
 * (Office Products, Appliances, Pet Supplies, Smart Home on prod) is declined
 * by the calculator and the shop hides it. This job fetches ONE such product's
 * details per run through a product endpoint the extraction pipeline already
 * maps (the same mappers, so a weight is read here exactly as a paste reads
 * it), stores the weight, and re-strikes the landed price through the
 * calculator. Pricing values stay the admin's: nothing here invents a weight
 * or touches a pricing group.
 *
 *   budget → claim one row (attempt counted) → one vendor call → budget += 1
 *          → store weight → re-price → audit
 *
 * Each row gets `CATALOG_ENRICH.maxAttempts` tries, each on the next vendor in
 * its store's plan, `retryAfterHours` apart. A product with no weight anywhere
 * is then left to the clean-up.
 */

export type EnrichVendor = "scraperapi" | "oxylabs" | "zyte";

/** Cheapest, most weight-bearing source first. Every entry has a mapper that reads weight. */
export const ENRICH_PLANS: Record<CatalogStore, readonly EnrichVendor[]> = {
  // ScraperAPI's product_information carries item_weight; Oxylabs carries it too.
  amazon: ["scraperapi", "oxylabs", "zyte"],
  ebay: ["scraperapi", "zyte"],
  walmart: ["oxylabs", "zyte"],
  etsy: ["zyte"],
  nike: ["zyte"],
};

export function configuredEnrichVendors(): Record<EnrichVendor, boolean> {
  return { scraperapi: isScraperApiConfigured(), oxylabs: isOxylabsConfigured(), zyte: isZyteConfigured() };
}

/**
 * The vendor for a row's Nth attempt (1-based, as the claim returns it):
 * attempt 1 takes the first configured vendor in the plan, attempt 2 the
 * second, and a plan shorter than the attempt count repeats its last entry.
 * Null when the store has no configured vendor at all. Pure.
 */
export function enrichVendorFor(store: CatalogStore, attempt: number, configured: Record<EnrichVendor, boolean>): EnrichVendor | null {
  const plan = ENRICH_PLANS[store].filter((v) => configured[v]);
  if (plan.length === 0) return null;
  return plan[Math.min(Math.max(attempt, 1), plan.length) - 1] ?? null;
}

/** Stores with at least one configured vendor. Only these are claimed. Pure. */
export function enrichableStores(configured: Record<EnrichVendor, boolean>): CatalogStore[] {
  return CATALOG_STORES.filter((s) => enrichVendorFor(s, 1, configured) !== null);
}

/** One product-details call; the weight in pounds, or null. Never throws. */
async function fetchWeight(row: CatalogEnrichmentRow, vendor: EnrichVendor): Promise<number | null> {
  const url = row.product_url;
  try {
    if (vendor === "scraperapi") {
      if (row.store === "amazon") {
        const asin = row.external_id ?? amazonAsinOf(url);
        const item = asin ? await fetchAmazonProductStructured(asin, "com", "us") : null;
        return item ? mapScraperApiAmazon(item, url).weight_lbs ?? null : null;
      }
      if (row.store === "ebay") {
        const id = row.external_id ?? ebayItemIdOf(url);
        const item = id ? await fetchEbayProductStructured(id, "us") : null;
        return item ? mapScraperApiEbay(item, url).weight_lbs ?? null : null;
      }
      return null;
    }
    if (vendor === "oxylabs") {
      if (row.store === "amazon") {
        const asin = row.external_id ?? amazonAsinOf(url);
        const item = asin ? await fetchOxylabsAmazonProduct(asin, "com") : null;
        return item ? mapOxylabsAmazon(item, url).weight_lbs ?? null : null;
      }
      if (row.store === "walmart") {
        const id = walmartProductIdOf(url) ?? row.external_id;
        const item = id ? await fetchOxylabsWalmartProduct(id) : null;
        return item ? mapOxylabsWalmart(item, url).weight_lbs ?? null : null;
      }
      return null;
    }
    const item = await fetchZyteProduct(url, { geolocation: "US" });
    return item ? mapZyteProduct(item, "USD").weight_lbs ?? null : null;
  } catch (error) {
    logger.warn("catalog-enrich: vendor call threw", { id: row.id, vendor, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** A weight worth storing: positive, finite and not absurd for something we ship by air. */
export function plausibleWeightLbs(weight: number | null | undefined): number | null {
  if (weight == null || !Number.isFinite(weight) || weight <= 0 || weight > 2_000) return null;
  return Math.round(weight * 1000) / 1000;
}

export interface CatalogEnrichSummary {
  product_id: string | null;
  store: CatalogStore | null;
  vendor: EnrichVendor | null;
  attempt: number | null;
  weight_lbs: number | null;
  /** The re-struck figure, when the weight made the row payable. */
  landed_ghs: number | null;
  budget_used: number;
  budget_cap: number;
  skipped?: "budget" | "nothing_due" | "vendor_unconfigured";
}

export async function runCatalogEnrichJob(now: Date = new Date()): Promise<CatalogEnrichSummary> {
  const period = budgetPeriodOf(now);
  const budget = await readJobBudget(CATALOG_ENRICH.jobName, CATALOG_ENRICH.monthlyCaps, period);
  const summary: CatalogEnrichSummary = {
    product_id: null,
    store: null,
    vendor: null,
    attempt: null,
    weight_lbs: null,
    landed_ghs: null,
    budget_used: budget.used,
    budget_cap: budget.cap,
  };

  if (budget.used >= budget.cap) {
    summary.skipped = "budget";
    return finish(summary);
  }
  const configured = configuredEnrichVendors();
  const stores = enrichableStores(configured);
  if (stores.length === 0) {
    summary.skipped = "vendor_unconfigured";
    return finish(summary);
  }

  const row = await claimCatalogEnrichment({
    nowIso: now.toISOString(),
    retryBeforeIso: new Date(now.getTime() - CATALOG_ENRICH.retryAfterHours * 3_600_000).toISOString(),
    maxAttempts: CATALOG_ENRICH.maxAttempts,
    stores,
  });
  if (!row) {
    summary.skipped = "nothing_due";
    return finish(summary);
  }
  summary.product_id = row.id;
  summary.store = row.store;
  summary.attempt = row.enrich_attempts;

  // Non-null: the claim only takes rows of a store with a configured vendor.
  const vendor = enrichVendorFor(row.store, row.enrich_attempts, configured)!;
  summary.vendor = vendor;

  let weight: number | null = null;
  try {
    weight = plausibleWeightLbs(await fetchWeight(row, vendor));
  } finally {
    const spent = await spendJobBudget(CATALOG_ENRICH.jobName, CATALOG_ENRICH.monthlyCaps, period);
    summary.budget_used = spent.used;
    summary.budget_cap = spent.cap;
  }

  if (weight == null) {
    logger.info("catalog-enrich: no weight found", { id: row.id, store: row.store, vendor, attempt: row.enrich_attempts });
    return finish(summary);
  }

  summary.weight_lbs = weight;
  await writeCatalogProductWeight(row.id, { weight_lbs: weight, weight_source: vendor });

  // Re-strike now, with the calculator, so the row reaches the shop on this
  // run rather than on the next landed-price refresh.
  const calculator = await loadPricingCalculator();
  const { breakdown, decline } = await strikeLandedFigure(calculator, { ...row, weight_lbs: weight });
  await writeCatalogLandedPrices([{ id: row.id, landed_ghs: breakdown ? breakdown.total_ghs : null, decline }]);
  summary.landed_ghs = breakdown ? breakdown.total_ghs : null;
  return finish(summary);
}

async function finish(summary: CatalogEnrichSummary): Promise<CatalogEnrichSummary> {
  await logAuditEvent({
    actorId: null,
    actorRole: "system",
    action: "catalog_enrich_run",
    entityType: "job",
    entityId: summary.product_id,
    metadata: { ...summary },
  });
  logger.info("catalog-enrich: done", { ...summary });
  return summary;
}
