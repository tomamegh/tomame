import type { CatalogStore } from "@/config/catalog";

import { postFilterListings, type FinderListing } from "./shortlist";
import type { ParsedFinderSpec } from "./spec";

/**
 * The fast answer's rules. Pure.
 *
 * Only stores that sell their own stock or police their sellers (Amazon, then
 * Walmart) and only listings we have already priced: the catalogue answers in
 * milliseconds, so the customer has something good to buy while the full
 * search across every store looks for the cheapest.
 */
export const QUICK_PICK_STORES: readonly CatalogStore[] = ["amazon", "walmart"];

/** How many catalogue matches are read at the store before giving up on a fast answer. */
export const QUICK_PICK_TRIES = 2;

/**
 * The catalogue rows that may be a fast answer, best first: a trusted store,
 * a listed price, new, not an accessory or a multipack nobody asked for, and
 * among the exact matches (`isMatch`), Amazon ahead of Walmart, then cheapest.
 */
export function quickPickOrder(
  catalogue: readonly FinderListing[],
  spec: Pick<ParsedFinderSpec, "product" | "searchQuery">,
  allowed: ReadonlySet<CatalogStore>,
  isMatch: (l: FinderListing) => boolean,
): FinderListing[] {
  const trusted = new Set(QUICK_PICK_STORES.filter((s) => allowed.has(s)));
  const { kept } = postFilterListings(
    catalogue.filter((l) => l.priceUsd != null && l.priceUsd > 0),
    spec,
    trusted,
  );
  const rank = (s: CatalogStore) => QUICK_PICK_STORES.indexOf(s);
  return kept
    .filter(isMatch)
    .sort((a, b) => rank(a.store) - rank(b.store) || a.priceUsd! - b.priceUsd!);
}

/** True when the store's own stock line says it can be bought now. */
export function saysInStock(availability: string | null | undefined): boolean {
  if (!availability) return false;
  if (/\b(out of stock|unavailable|sold out|currently unavailable|pre-?order|back ?order)\b/i.test(availability)) return false;
  return /\bin stock\b|\bavailable\b|only \d+ left/i.test(availability);
}

/** The line under the fast answer: why this one, in plain words. */
export function quickPickReason(storeName: string): string {
  return `In stock at ${storeName}, new, price checked just now. We're still searching every store for a lower price.`;
}
