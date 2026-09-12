import "server-only";
import { logger } from "@/lib/logger";
import { searchCatalogProducts, type CatalogSearchHit, type CatalogStore } from "@/db/queries/catalog";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
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
  count: number;
  results: CatalogSearchResult[];
}

/**
 * Link-free search: text-match the pre-scraped catalogue, then price every hit
 * with ONE calculator instance (constants, category map, fixed-freight list and
 * FX are loaded once per request, not once per row). Sorted by landed GH₵
 * ascending so "cheapest option" is the first row; unpriceable rows keep
 * their text rank and sit at the end, flagged rather than hidden.
 */
export async function searchCatalog(q: string, options: { limit: number }): Promise<CatalogSearchResponse> {
  const query = q.trim();
  const hits = await searchCatalogProducts({ q: query, limit: options.limit });
  if (hits.length === 0) return { query, count: 0, results: [] };

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
  return { query, count: ordered.length, results: ordered };
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
    if (breakdown.total_ghs == null || !Number.isFinite(breakdown.total_ghs)) return base;
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
