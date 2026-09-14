import "server-only";
import { logger } from "@/lib/logger";
import {
  listCatalogCategories,
  listCatalogProductsByCategory,
  searchCatalogProducts,
  type CatalogCategoryCount,
  type CatalogSearchHit,
  type CatalogStore,
} from "@/db/queries/catalog";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { isPayablePricing } from "@/lib/pricing/payable";
import type { PricingCalculator } from "@/lib/pricing/calculator";

export interface CatalogSearchResult {
  id: string;
  store: CatalogStore;
  external_id: string | null;
  title: string;
  image_url: string | null;
  /** Hand-off target for the quote flow: `/app/orders/new?url=`. */
  product_url: string;
  price_usd: number | null;
  currency: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  last_seen_at: string;
  /** Landed GH₵ for quantity 1 from the live pricing engine; null when unpriceable. */
  total_ghs: number | null;
  pricing_group: string | null;
  pricing_method: string | null;
  exchange_rate: number | null;
  /** No listed price, or the engine could not price it — sorted last. */
  unpriceable: boolean;
  /** Lowest landed total among this store's results. */
  cheapest_in_store: boolean;
}

export interface CatalogSearchResponse {
  query: string;
  /** How many rows are in `results` — this page, not the whole match. */
  count: number;
  /**
   * Everything that matched, before the page limit. `count` and `total` are
   * equal on the last page and that is exactly how the screen decides whether
   * to offer "show more" — and how it can say "24 of 63" without guessing.
   */
  total: number;
  results: CatalogSearchResult[];
}

/**
 * Link-free search: text-match the pre-scraped catalogue, then price every hit
 * with ONE calculator instance (constants, category map, fixed-freight list and
 * FX are loaded once per request, not once per row). Sorted by landed GH₵
 * ascending so "cheapest option" is the first row; unpriceable rows keep
 * their text rank and sit at the end, flagged rather than hidden.
 */
export async function searchCatalog(
  q: string,
  options: { limit: number; category?: string | null },
): Promise<CatalogSearchResponse> {
  const query = q.trim();
  const hits = await searchCatalogProducts({
    q: query,
    limit: options.limit,
    category: options.category ?? null,
  });
  if (hits.length === 0) return { query, count: 0, total: 0, results: [] };
  // Off the first row, because that is where the RPC's window function put it
  // (062). An older stored procedure that does not carry it leaves the page
  // total equal to the page, which is the honest reading of "we cannot tell".
  const total = hits[0]?.total_count ?? hits.length;

  const calculator = await loadPricingCalculator();
  const results: CatalogSearchResult[] = [];
  // Sequential on purpose: the first `calculate` lazily loads the FX rate and
  // caches it on the instance; a parallel burst would race that load.
  for (const hit of hits) results.push(await priceHit(calculator, hit));

  const priced = results.filter((r) => !r.unpriceable).sort((a, b) => a.total_ghs! - b.total_ghs!);
  const unpriceable = results.filter((r) => r.unpriceable);

  const seenStore = new Set<CatalogStore>();
  for (const r of priced) {
    if (!seenStore.has(r.store)) {
      r.cheapest_in_store = true;
      seenStore.add(r.store);
    }
  }

  const ordered = [...priced, ...unpriceable];
  return { query, count: ordered.length, total, results: ordered };
}

async function priceHit(calculator: PricingCalculator, hit: CatalogSearchHit): Promise<CatalogSearchResult> {
  const base: CatalogSearchResult = {
    id: hit.id,
    store: hit.store,
    external_id: hit.external_id,
    title: hit.title,
    image_url: hit.image_url,
    product_url: hit.product_url,
    price_usd: hit.price_usd,
    currency: hit.currency,
    rating: hit.rating,
    review_count: hit.review_count,
    category: hit.category,
    last_seen_at: hit.last_seen_at,
    total_ghs: null,
    pricing_group: null,
    pricing_method: null,
    exchange_rate: null,
    unpriceable: true,
    cheapest_in_store: false,
  };

  const price = hit.price_usd != null ? Number(hit.price_usd) : null;
  if (price == null || !(price > 0)) return base;

  try {
    const currency = (hit.currency ?? "USD").toUpperCase();
    const breakdown = await calculator.calculate(
      {
        ...(currency === "USD" ? { itemPriceUsd: price } : { itemPrice: price, itemCurrency: currency }),
        quantity: 1,
        category: hit.category,
        productTitle: hit.title,
        region: "usa",
      },
      null,
    );
    // `needs_review` IS NOT A PRICE, and it does not announce itself as missing.
    // `buildReview` returns a fully-formed breakdown whose every total is ZERO
    // (calculator.ts:506) — which is how a Smart Home speaker with no listed
    // weight, a group priced by a weight expression, reached this screen reading
    // "GH₵0.00 delivered to your door" against a $79.99 listing. Worse, zero is
    // the smallest number on the page, so it sorted to the front and wore the
    // "Cheapest on eBay" badge.
    //
    // So the guard is on the METHOD as well as the number, and the number has to
    // be positive rather than merely finite. A row we cannot price is flagged
    // and parked at the end, which the screen already knows how to say.
    if (!isPayablePricing(breakdown)) return base;
    return {
      ...base,
      total_ghs: breakdown.total_ghs,
      pricing_group: breakdown.pricing_group,
      pricing_method: breakdown.pricing_method,
      exchange_rate: breakdown.exchange_rate,
      unpriceable: false,
    };
  } catch (error) {
    logger.warn("catalog-search: could not price hit", { id: hit.id, error: error instanceof Error ? error.message : String(error) });
    return base;
  }
}


/**
 * Browsing, rather than searching: one category's products, already priced.
 *
 * WHY THIS EXISTS. The search screen answered "say what you want", but a
 * customer who has not yet pasted anything does not know what we hold, and until
 * now the only route to it was a rail on a quote screen you could reach only by
 * pasting a link first. Kelvin: "To access search without a link, a user must
 * first search with a link, and then navigate there." Browsing by category is
 * the way in that needs nothing from the customer.
 *
 * It shares `priceHit` with `searchCatalog`, so a browsed card and a searched
 * card carry the same landed total struck the same way. The ordering is redone
 * here on the real figure: the query can only order by the store's own price,
 * which is not the number the customer pays.
 */
export async function browseCatalogCategory(
  category: string,
  options: { limit: number },
): Promise<CatalogSearchResponse> {
  const hits = await listCatalogProductsByCategory({ category, limit: options.limit });
  // The shelf's real size is the category's own count, which the caller already
  // holds from `listBrowsableCategories`; this figure is only ever the page.
  if (hits.length === 0) return { query: category, count: 0, total: 0, results: [] };

  const calculator = await loadPricingCalculator();
  const results: CatalogSearchResult[] = [];
  // Sequential, for the reason `searchCatalog` gives: the first `calculate`
  // lazily loads the FX rate onto the instance and a parallel burst races it.
  for (const hit of hits) results.push(await priceHit(calculator, hit));

  const priced = results
    .filter((r) => !r.unpriceable)
    .sort((a, b) => a.total_ghs! - b.total_ghs!);
  const unpriceable = results.filter((r) => r.unpriceable);

  const seenStore = new Set<CatalogStore>();
  for (const r of priced) {
    if (!seenStore.has(r.store)) {
      r.cheapest_in_store = true;
      seenStore.add(r.store);
    }
  }

  const ordered = [...priced, ...unpriceable];
  return { query: category, count: ordered.length, total: ordered.length, results: ordered };
}

/** What the browse screen offers, largest category first. Never throws upward. */
export async function listBrowsableCategories(): Promise<CatalogCategoryCount[]> {
  return listCatalogCategories();
}
