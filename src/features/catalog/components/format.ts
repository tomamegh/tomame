/**
 * Pure display helpers for the pre-priced catalogue.
 *
 * Framework free (no React, no `server-only`, no Supabase) so the server page
 * and the client rail can both import them, and so every rule below is unit
 * testable without a DOM.
 *
 * Nothing here calculates money. `total_ghs` arrives already struck by
 * `src/lib/pricing/calculator.ts`; these functions only decide how to print it,
 * and refuse to print anything at all where the server declined to price.
 */

import { CATALOG_SEARCH } from "@/config/catalog";
import type { CatalogProduct, CatalogStore } from "../types";

// ── Stores ───────────────────────────────────────────────────────────────────

/** How the two catalogue stores are written in customer-facing copy. */
export const CATALOG_STORE_LABEL: Record<CatalogStore, string> = {
  amazon: "Amazon",
  ebay: "eBay",
};

export function catalogStoreLabel(store: CatalogStore): string {
  return CATALOG_STORE_LABEL[store] ?? store;
}

// ── Hand-off ─────────────────────────────────────────────────────────────────

/**
 * Where a catalogue card leads: the ordinary paste flow, pre-filled.
 *
 * The catalogue never becomes a second way to order. A tap re-reads the listing
 * live and prices it through the same path a pasted link takes, so the figure a
 * customer commits to is a fresh one, not the one this card was printed with.
 */
export function catalogQuoteHref(productUrl: string): string {
  return `/app/orders/new?url=${encodeURIComponent(productUrl)}`;
}

// ── The query ────────────────────────────────────────────────────────────────

export type CatalogQueryState =
  /** Nothing typed yet: the screen has not been asked anything. */
  | { kind: "idle" }
  /** Typed, but shorter than the search accepts. */
  | { kind: "too-short"; typed: string; minLength: number }
  /** A query worth running. `truncated` when the raw text ran past the cap. */
  | { kind: "ready"; query: string; truncated: boolean };

/**
 * What the `q` in the address bar means, as one value the page can switch on.
 *
 * The URL is the only source of truth for the search, so the state a visitor
 * lands in is the state a shared link reproduces. An over-long query is cut to
 * the cap rather than rejected: the server rejects it outright, and telling
 * someone who pasted a whole product title that their search is invalid is
 * worse than searching the part of it we can.
 */
export function resolveCatalogQuery(
  raw: string | string[] | undefined,
): CatalogQueryState {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const typed = (first ?? "").trim();
  if (typed.length === 0) return { kind: "idle" };
  if (typed.length < CATALOG_SEARCH.minQueryLength) {
    return {
      kind: "too-short",
      typed,
      minLength: CATALOG_SEARCH.minQueryLength,
    };
  }
  if (typed.length > CATALOG_SEARCH.maxQueryLength) {
    return {
      kind: "ready",
      query: typed.slice(0, CATALOG_SEARCH.maxQueryLength).trim(),
      truncated: true,
    };
  }
  return { kind: "ready", query: typed, truncated: false };
}

// ── Price age ────────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Past this, the reading is old enough that the card says so in amber. */
export const STALE_PRICE_DAYS = 7;

export interface PriceAge {
  /** "checked today" · "checked 3 days ago" · "checked on 12 Sep". */
  label: string;
  /** Older than `STALE_PRICE_DAYS`, so the card flags it rather than whispering it. */
  stale: boolean;
}

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * How old the reading behind a price is.
 *
 * Day granularity, not minutes: the scraper runs on an hourly tick against a
 * monthly budget, so "checked 41 min ago" would imply a freshness the job
 * cannot promise. A timestamp in the future (clock skew between the database
 * and the renderer) reads as today rather than as a date that has not happened.
 *
 * Returns null for an unreadable timestamp, so the caller drops the clause
 * instead of printing "checked Invalid Date ago".
 */
export function formatPriceAge(
  lastSeenAt: string,
  now: Date,
): PriceAge | null {
  const then = new Date(lastSeenAt);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return null;

  const elapsed = now.getTime() - then.getTime();
  const days = Math.floor(elapsed / DAY_MS);
  const stale = days >= STALE_PRICE_DAYS;

  if (elapsed < DAY_MS) return { label: "checked today", stale: false };
  if (days === 1) return { label: "checked yesterday", stale: false };
  if (days < STALE_PRICE_DAYS) return { label: `checked ${days} days ago`, stale };
  return { label: `checked on ${dayMonth.format(then)}`, stale: true };
}

// ── Ratings ──────────────────────────────────────────────────────────────────

const reviewFormatter = new Intl.NumberFormat("en-GB");

/**
 * "4.6 (2,481)" — the store's own rating, or null when there is none.
 *
 * A rating with no review count is still worth showing; a review count with no
 * rating is not, because "2,481" alone reads as a price on a card full of them.
 */
export function formatCatalogRating(
  rating: number | null,
  reviewCount: number | null,
): string | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  const stars = Math.round(rating * 10) / 10;
  if (reviewCount == null || !Number.isFinite(reviewCount) || reviewCount <= 0) {
    return `${stars}`;
  }
  return `${stars} (${reviewFormatter.format(Math.round(reviewCount))})`;
}

// ── The similar-products rail ────────────────────────────────────────────────

/**
 * Two product URLs that point at the same listing.
 *
 * Host case and a trailing slash are not a different product, and neither is a
 * tracking query string: a customer who pasted a link with `?ref=` on it would
 * otherwise be offered their own item back as an alternative.
 */
export function isSameListing(a: string, b: string): boolean {
  return canonicalListingUrl(a) === canonicalListingUrl(b);
}

function canonicalListingUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * The alternatives worth showing beside a quote.
 *
 * The product being quoted is dropped, and so is anything the server could not
 * price: an alternative with no price is not an alternative, it is another
 * quote to go and fetch. An empty array is a real answer and the caller must
 * render nothing at all rather than an empty shelf.
 */
export function pickSimilarProducts(
  results: readonly CatalogProduct[],
  options: { excludeUrl: string; limit: number },
): CatalogProduct[] {
  return results
    .filter((result) => !result.unpriceable && result.total_ghs != null)
    .filter((result) => !isSameListing(result.product_url, options.excludeUrl))
    .slice(0, Math.max(0, options.limit));
}
