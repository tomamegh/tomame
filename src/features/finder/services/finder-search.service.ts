import "server-only";

import type { CatalogStore } from "@/config/catalog";
import { FINDER } from "@/config/finder";
import { searchCatalogProducts, type CatalogProductInput, type CatalogSearchHit } from "@/db/queries/catalog";
import { budgetPeriodOf, readJobBudget, spendJobBudget } from "@/features/catalog/services/catalog-budget";
import { strikeLandedTotal } from "@/features/catalog/services/catalog-search.service";
import { configuredSearchVendors, fetchCatalogStoreSearch } from "@/features/catalog/services/catalog-vendors";
import type { PricingCalculator } from "@/lib/pricing/calculator";
import { logger } from "@/lib/logger";

import type { FinderListing } from "../shortlist";
import { planStoreSearches, type StorePlan } from "../stores";

/**
 * The finder's two searches: our own catalogue (free, already read) and the
 * stores' own search pages (one vendor call each, counted against the
 * `finder-search` monthly budget in `job_budgets`).
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function listingFromCatalogHit(hit: CatalogSearchHit & { url_hash?: string }): FinderListing {
  return {
    id: hit.url_hash ?? `cat:${hit.id}`,
    store: hit.store,
    title: hit.title,
    productUrl: hit.product_url,
    imageUrl: hit.image_url,
    priceUsd: hit.price_usd != null ? Number(hit.price_usd) : null,
    currency: hit.currency,
    condition: null,
    seller: null,
    source: "catalogue",
  };
}

export function listingFromVendorRow(row: CatalogProductInput): FinderListing {
  const raw = row.raw ?? {};
  return {
    id: row.url_hash,
    store: row.store,
    title: row.title,
    productUrl: row.product_url,
    imageUrl: row.image_url,
    priceUsd: row.price_usd,
    currency: row.currency,
    condition: str(raw.condition),
    seller: str(raw.seller_name) ?? str(raw.seller),
    source: "live",
  };
}

/** What we already hold for this search. A failed read is an empty shelf, never a failed run. */
export async function searchFinderCatalogue(searchQuery: string): Promise<FinderListing[]> {
  try {
    const hits = await searchCatalogProducts({ q: searchQuery, limit: FINDER.catalogueLimit });
    return hits.map(listingFromCatalogHit);
  } catch (error) {
    logger.warn("finder: catalogue search failed", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

export async function planFinderStores(wanted: readonly CatalogStore[], now: Date = new Date()): Promise<StorePlan> {
  const budget = await readJobBudget(FINDER.jobName, FINDER.monthlyCaps, budgetPeriodOf(now));
  return planStoreSearches(wanted, configuredSearchVendors(), budget.cap - budget.used);
}

export type StoreSearchResult = { store: CatalogStore; listings: FinderListing[]; failed: false } | { store: CatalogStore; listings: []; failed: true };

/**
 * One store's search page. Never throws: a vendor failure or a timeout is a
 * failed store, and the call is counted against the budget either way (a
 * failed vendor call still costs).
 */
export async function searchFinderStore(store: CatalogStore, query: string, now: Date = new Date()): Promise<StoreSearchResult> {
  const period = budgetPeriodOf(now);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("store search timed out")), FINDER.storeSearchTimeoutMs);
    });
    const fetched = await Promise.race([fetchCatalogStoreSearch(store, query, { queryId: null, category: null, timeoutMs: FINDER.storeSearchTimeoutMs - 2_000 }), timeout]);
    return { store, listings: fetched.items.map(listingFromVendorRow), failed: false };
  } catch (error) {
    logger.warn("finder: store search failed", { store, error: error instanceof Error ? error.message : String(error) });
    return { store, listings: [], failed: true };
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await spendJobBudget(FINDER.jobName, FINDER.monthlyCaps, period);
    } catch (error) {
      logger.warn("finder: budget spend not recorded", { store, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/** A quick landed estimate from the listed price, only to set aside clear misses. Never shown. */
export async function estimateLandedGhs(calculator: PricingCalculator, listing: FinderListing, category: string | null): Promise<number | null> {
  const breakdown = await strikeLandedTotal(calculator, {
    id: listing.id,
    title: listing.title,
    price_usd: listing.priceUsd,
    currency: listing.currency,
    category,
    store: listing.store,
  });
  return breakdown?.total_ghs ?? null;
}
