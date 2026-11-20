import { CATALOG_STORE_SEARCH, CATALOG_STORES, type CatalogSearchVendor, type CatalogStore } from "@/config/catalog";
import { findStore } from "@/features/extraction/stores";

import type { StoreSkipReason } from "./narration";
import type { FinderListing } from "./shortlist";

/**
 * Which stores the finder may offer and which it searches. Pure over the
 * store registry.
 *
 * Offer: a catalogue store whose registry entry is `live` and ships from the
 * USA — the lane the finder buys on. Search: Amazon, Walmart and eBay by
 * default (one structured search each); Nike and Etsy only when the request
 * names them, because their searches are slow and spend the free Zyte
 * allowance every other store's quotes depend on.
 */

const PROBE_URL: Record<CatalogStore, string> = {
  amazon: "https://www.amazon.com/",
  ebay: "https://www.ebay.com/",
  walmart: "https://www.walmart.com/",
  etsy: "https://www.etsy.com/",
  nike: "https://www.nike.com/",
};

export function finderStoreName(store: CatalogStore): string {
  return findStore(PROBE_URL[store])?.name ?? store;
}

/** Stores the finder may put in front of a customer. Empty when the US lane is closed. */
export function finderAllowedStores(usLaneOpen: boolean): Set<CatalogStore> {
  if (!usLaneOpen) return new Set();
  return new Set(
    CATALOG_STORES.filter((s) => {
      const def = findStore(PROBE_URL[s]);
      return def != null && def.status === "live" && def.region === "USA";
    }),
  );
}

const DEFAULT_SEARCH: readonly CatalogStore[] = ["amazon", "walmart", "ebay"];

/** The stores to search for this request, in order, from those allowed. */
export function pickSearchStores(text: string, allowed: ReadonlySet<CatalogStore>): CatalogStore[] {
  const wanted: CatalogStore[] = [...DEFAULT_SEARCH];
  if (/\b(nike|jordans?|air max|air force)\b/i.test(text)) wanted.push("nike");
  if (/\b(etsy|handmade|hand-made|personali[sz]ed|custom[- ]made)\b/i.test(text)) wanted.push("etsy");
  return wanted.filter((s) => allowed.has(s));
}

export interface StorePlan {
  search: CatalogStore[];
  skipped: Array<{ store: CatalogStore; reason: StoreSkipReason }>;
}

/**
 * Which of the wanted stores this run may actually search: the vendor key is
 * present and the month's budget has room for one call each, or the store is
 * in `free`. Pure.
 */
export function planStoreSearches(
  wanted: readonly CatalogStore[],
  configured: Record<CatalogSearchVendor, boolean>,
  budgetLeft: number,
  free: ReadonlySet<CatalogStore> = new Set(),
): StorePlan {
  const search: CatalogStore[] = [];
  const skipped: StorePlan["skipped"] = [];
  let left = Math.max(0, budgetLeft);
  for (const store of wanted) {
    const spec = CATALOG_STORE_SEARCH[store];
    // A store searched through its own free API (eBay Browse) needs no vendor key and spends no budget.
    if (free.has(store)) search.push(store);
    else if (!spec.enabled || !configured[spec.vendor]) skipped.push({ store, reason: "no_key" });
    else if (left <= 0) skipped.push({ store, reason: "budget" });
    else {
      search.push(store);
      left -= 1;
    }
  }
  return { search, skipped };
}

/**
 * Catalogue and live rows for the same product are one listing; the live
 * one is fresher and wins. Then stores take turns, so one store's forty rows
 * cannot crowd the others out of the model's view.
 */
export function mergeListings(live: readonly FinderListing[], catalogue: readonly FinderListing[], limit: number): FinderListing[] {
  const seen = new Set<string>();
  const unique: FinderListing[] = [];
  for (const l of [...live, ...catalogue]) {
    const key = l.productUrl.toLowerCase();
    if (seen.has(l.id) || seen.has(key)) continue;
    seen.add(l.id);
    seen.add(key);
    unique.push(l);
  }
  const byStore = new Map<string, FinderListing[]>();
  for (const l of unique) byStore.set(l.store, [...(byStore.get(l.store) ?? []), l]);
  const queues = [...byStore.values()];
  const out: FinderListing[] = [];
  while (out.length < limit && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < limit) out.push(next);
    }
  }
  return out;
}
