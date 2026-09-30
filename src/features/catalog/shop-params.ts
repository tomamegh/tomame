/**
 * The shop's address: every filter, the sort and the page live in the query
 * string of `/app/orders/new?mode=browse`, and this module is the only thing
 * that reads or writes them.
 *
 * WHY THE URL AND NOTHING ELSE. A filtered page is something a customer can
 * send, the back button walks back through every filter they tried, a reload
 * keeps their place, and the screen stays a server component because there is
 * no client state to hold. It is the same rule the rest of Buy for me follows
 * (`buy-for-me-mode.ts`).
 *
 * Framework free (no React, no `server-only`) so the route, the server
 * components and the one client island (the filter sheet) share one parser,
 * and so every rule here is unit tested without a DOM.
 *
 * Nothing here is money maths. The price bounds are what the customer asked
 * to see; the database compares them against the calculator's stored figure.
 */

import { BUY_FOR_ME_PATH } from "@/features/extraction/components/buy-for-me-mode";
import { CATALOG_STORES } from "@/config/catalog";
import { CATALOG_STORE_LABEL } from "./components/format";
import type { CatalogCondition, CatalogStore } from "./types";

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const SHOP_PAGE_SIZE = 24;
/** Rows per department on the grouped front page. */
export const SHOP_GROUP_SIZE = 4;
/** A hand-typed `?page=900000` is a page past the end, not a huge OFFSET. */
export const SHOP_MAX_PAGE = 500;

export type ShopSort = "recommended" | "newest" | "price_asc" | "price_desc" | "rating";
export type ShopCondition = CatalogCondition;

export const SHOP_SORTS: readonly { value: ShopSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Recently checked" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
];

export const SHOP_STORES: readonly CatalogStore[] = CATALOG_STORES;

export const SHOP_CONDITIONS: readonly { value: ShopCondition; label: string }[] = [
  { value: "new", label: "New" },
  { value: "open_box", label: "Open box" },
  { value: "refurbished", label: "Refurbished" },
  { value: "used", label: "Pre-owned" },
];

export const SHOP_RATINGS = [4, 3] as const;
export type ShopRating = (typeof SHOP_RATINGS)[number];

/**
 * GH₵ edges for the price buckets. Passed to `catalog_shop_facets` as
 * `width_bucket` thresholds, so bucket `i` is `[edges[i-1], edges[i])` and the
 * counts beside each one are the database's.
 */
export const SHOP_PRICE_EDGES = [500, 1000, 2500, 5000, 10000] as const;

export interface ShopPriceBucket {
  /** `width_bucket`'s index for this range. */
  index: number;
  min: number | null;
  max: number | null;
  label: string;
}

const ghs = (n: number) => `GH₵${n.toLocaleString("en-GH")}`;

export const SHOP_PRICE_BUCKETS: readonly ShopPriceBucket[] = SHOP_PRICE_EDGES.map(
  (edge, i): ShopPriceBucket =>
    i === 0
      ? { index: 0, min: null, max: edge, label: `Under ${ghs(edge)}` }
      : { index: i, min: SHOP_PRICE_EDGES[i - 1]!, max: edge, label: `${ghs(SHOP_PRICE_EDGES[i - 1]!)} – ${ghs(edge)}` },
).concat({
  index: SHOP_PRICE_EDGES.length,
  min: SHOP_PRICE_EDGES[SHOP_PRICE_EDGES.length - 1]!,
  max: null,
  label: `${ghs(SHOP_PRICE_EDGES[SHOP_PRICE_EDGES.length - 1]!)} and up`,
});

export function conditionLabel(value: ShopCondition): string {
  return SHOP_CONDITIONS.find((c) => c.value === value)?.label ?? value;
}

export function sortLabel(value: ShopSort): string {
  return SHOP_SORTS.find((s) => s.value === value)?.label ?? "Recommended";
}

// ── State ───────────────────────────────────────────────────────────────────

export interface ShopState {
  q: string;
  category: string | null;
  stores: CatalogStore[];
  conditions: ShopCondition[];
  minGhs: number | null;
  maxGhs: number | null;
  rating: ShopRating | null;
  sort: ShopSort;
  page: number;
  /** `all` asks for the flat grid when nothing else would leave the grouped front page. */
  view: "all" | null;
}

export const EMPTY_SHOP_STATE: ShopState = {
  q: "",
  category: null,
  stores: [],
  conditions: [],
  minGhs: null,
  maxGhs: null,
  rating: null,
  sort: "recommended",
  page: 1,
  view: null,
};

export type ShopSearchParams = Record<string, string | string[] | undefined>;

/** Every value of a parameter, repeated (`?store=a&store=b`) or comma-joined (`?store=a,b`). */
function allValues(raw: string | string[] | undefined): string[] {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list.flatMap((v) => v.split(",")).map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function firstValue(raw: string | string[] | undefined): string {
  return ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim();
}

/** A whole, positive cedi amount, or null. "1,500" and "GH₵1500" both read as 1500. */
function parseGhs(raw: string | string[] | undefined): number | null {
  const text = firstValue(raw);
  // A negative bound is no bound; stripping the sign would read "-5" as 5.
  if (text.includes("-")) return null;
  const digits = text.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const n = Math.round(Number.parseFloat(digits));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 10_000_000);
}

/** In a fixed order, deduplicated, so equal filters always produce equal URLs. */
function pickKnown<T extends string>(values: string[], known: readonly T[]): T[] {
  const asked = new Set(values);
  return known.filter((k) => asked.has(k));
}

/**
 * The query string, as one value. Anything unrecognised is dropped rather than
 * rejected: a truncated or hand-edited link should open the shop, not break it.
 *
 * `categories` is what the catalogue holds; `?category=` is matched against it
 * case-insensitively (mail clients lowercase links) and an unknown one is
 * ignored, never an empty page.
 */
export function parseShopParams(params: ShopSearchParams, categories: readonly string[] = []): ShopState {
  // `?department=` is an alias: the customer-facing word is "category" now
  // (Kelvin, 2026-09-30), and a link written the other way still opens.
  const askedCategory = firstValue(params.category ?? params.department).toLowerCase();
  const category = askedCategory
    ? (categories.find((c) => c.trim().toLowerCase() === askedCategory) ?? null)
    : null;

  let minGhs = parseGhs(params.min);
  let maxGhs = parseGhs(params.max);
  if (minGhs != null && maxGhs != null && minGhs > maxGhs) [minGhs, maxGhs] = [maxGhs, minGhs];

  const ratingNumber = Number.parseInt(firstValue(params.rating), 10);
  const rating = (SHOP_RATINGS as readonly number[]).includes(ratingNumber) ? (ratingNumber as ShopRating) : null;

  const sortAsked = firstValue(params.sort).toLowerCase();
  const sort = SHOP_SORTS.some((s) => s.value === sortAsked) ? (sortAsked as ShopSort) : "recommended";

  const pageAsked = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isFinite(pageAsked) && pageAsked > 1 ? Math.min(pageAsked, SHOP_MAX_PAGE) : 1;

  return {
    q: firstValue(params.q),
    category,
    stores: pickKnown(allValues(params.store), SHOP_STORES),
    conditions: pickKnown(
      allValues(params.condition),
      SHOP_CONDITIONS.map((c) => c.value),
    ),
    minGhs,
    maxGhs,
    rating,
    sort,
    page,
    view: firstValue(params.view).toLowerCase() === "all" ? "all" : null,
  };
}

/** How many filters are narrowing the set. The search term and the sort are not filters. */
export function countActiveFilters(state: ShopState): number {
  return (
    (state.category ? 1 : 0) +
    state.stores.length +
    state.conditions.length +
    (state.minGhs != null || state.maxGhs != null ? 1 : 0) +
    (state.rating != null ? 1 : 0)
  );
}

/**
 * The grouped front page: a shelf per department instead of one long grid.
 * Only when the customer has asked for nothing at all — any filter, search,
 * sort, page or `view=all` is a question the flat grid answers.
 */
export function isGroupedView(state: ShopState): boolean {
  return (
    !state.q &&
    countActiveFilters(state) === 0 &&
    state.sort === "recommended" &&
    state.page === 1 &&
    state.view !== "all"
  );
}

// ── Addresses ───────────────────────────────────────────────────────────────

/**
 * The address of a shop state, with `patch` applied.
 *
 * ANY CHANGE BUT THE PAGE GOES BACK TO PAGE ONE. Page 4 of "Amazon, under
 * GH₵1,000" is not a place in "eBay, refurbished"; landing on it would be an
 * empty page or an arbitrary one. Defaults are never written, and parameters
 * are written in one fixed order, so one state has exactly one address.
 */
export function shopHref(state: ShopState, patch: Partial<ShopState> = {}): string {
  const touchesPage = "page" in patch;
  const next: ShopState = { ...state, ...patch, page: touchesPage ? (patch.page ?? 1) : 1 };
  // A filter or a sort already leaves the grouped page; `view=all` is only
  // worth writing when nothing else would.
  const view = next.view === "all" && isGroupedView({ ...next, view: null }) ? "all" : null;

  const params = new URLSearchParams({ mode: "browse" });
  if (next.q.trim()) params.set("q", next.q.trim());
  if (next.category) params.set("category", next.category);
  for (const store of pickKnown(next.stores, SHOP_STORES)) params.append("store", store);
  for (const condition of pickKnown(next.conditions, SHOP_CONDITIONS.map((c) => c.value))) {
    params.append("condition", condition);
  }
  if (next.minGhs != null) params.set("min", String(next.minGhs));
  if (next.maxGhs != null) params.set("max", String(next.maxGhs));
  if (next.rating != null) params.set("rating", String(next.rating));
  if (next.sort !== "recommended") params.set("sort", next.sort);
  if (view) params.set("view", view);
  if (next.page > 1) params.set("page", String(next.page));
  return `${BUY_FOR_ME_PATH}?${params.toString()}`;
}

export function toggleStore(state: ShopState, store: CatalogStore): Partial<ShopState> {
  return {
    stores: state.stores.includes(store) ? state.stores.filter((s) => s !== store) : [...state.stores, store],
  };
}

export function toggleCondition(state: ShopState, condition: ShopCondition): Partial<ShopState> {
  return {
    conditions: state.conditions.includes(condition)
      ? state.conditions.filter((c) => c !== condition)
      : [...state.conditions, condition],
  };
}

/** The bucket the current bounds are exactly, or null for a custom range. */
export function activePriceBucket(state: ShopState): ShopPriceBucket | null {
  if (state.minGhs == null && state.maxGhs == null) return null;
  return SHOP_PRICE_BUCKETS.find((b) => b.min === state.minGhs && b.max === state.maxGhs) ?? null;
}

export function priceRangeLabel(minGhs: number | null, maxGhs: number | null): string | null {
  const bucket = SHOP_PRICE_BUCKETS.find((b) => b.min === minGhs && b.max === maxGhs);
  if (bucket) return bucket.label;
  if (minGhs != null && maxGhs != null) return `${ghs(minGhs)} – ${ghs(maxGhs)}`;
  if (minGhs != null) return `${ghs(minGhs)} and up`;
  if (maxGhs != null) return `Up to ${ghs(maxGhs)}`;
  return null;
}

export interface ShopChip {
  key: string;
  label: string;
  /** The same shop with this one filter taken off. */
  removeHref: string;
}

/** One removable chip per active filter, in the sidebar's order. */
export function activeShopChips(state: ShopState): ShopChip[] {
  const chips: ShopChip[] = [];
  if (state.category) {
    chips.push({ key: "category", label: state.category, removeHref: shopHref(state, { category: null }) });
  }
  for (const store of state.stores) {
    chips.push({
      key: `store:${store}`,
      label: CATALOG_STORE_LABEL[store],
      removeHref: shopHref(state, toggleStore(state, store)),
    });
  }
  for (const condition of state.conditions) {
    chips.push({
      key: `condition:${condition}`,
      label: conditionLabel(condition),
      removeHref: shopHref(state, toggleCondition(state, condition)),
    });
  }
  const price = priceRangeLabel(state.minGhs, state.maxGhs);
  if (price) {
    chips.push({ key: "price", label: price, removeHref: shopHref(state, { minGhs: null, maxGhs: null }) });
  }
  if (state.rating != null) {
    chips.push({ key: "rating", label: `${state.rating}★ & up`, removeHref: shopHref(state, { rating: null }) });
  }
  return chips;
}

/** Every filter off; the search term and the sort survive, as on any shop. */
export function clearFiltersHref(state: ShopState): string {
  return shopHref(state, {
    category: null,
    stores: [],
    conditions: [],
    minGhs: null,
    maxGhs: null,
    rating: null,
  });
}

/**
 * The page numbers to draw: first, last, and a window around the current page,
 * with `null` where a run is skipped. `[1, null, 4, 5, 6, null, 12]`.
 */
export function paginationWindow(page: number, pageCount: number, radius = 1): (number | null)[] {
  if (pageCount <= 1) return [1];
  const wanted = new Set<number>([1, pageCount]);
  for (let p = page - radius; p <= page + radius; p += 1) {
    if (p >= 1 && p <= pageCount) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const previous = sorted[i - 1];
    if (previous != null && current - previous === 2) out.push(previous + 1);
    else if (previous != null && current - previous > 2) out.push(null);
    out.push(current);
  }
  return out;
}
