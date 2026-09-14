/**
 * The shape of a catalogue search result as the BROWSER sees it.
 *
 * A deliberate mirror of `CatalogSearchResult` in
 * `services/catalog-search.service.ts`, which is a `server-only` module: the
 * similar-products rail runs in the client, and importing the service's type
 * would drag a service-role Supabase import into the bundle graph.
 *
 * The two cannot drift silently. `/app/products/page.tsx` assigns the service's
 * own results into this type, so a field that changes shape server-side fails
 * `npm run typecheck` rather than failing in a card at runtime.
 *
 * Nothing here is calculated in the browser. `total_ghs` is the landed cedi
 * total for quantity 1, struck server-side by the pricing engine at the moment
 * of the search; the components only choose how to print it.
 */

/** The two stores the pre-scraper knows how to search. */
export type CatalogStore = "amazon" | "ebay";

export interface CatalogProduct {
  id: string;
  store: CatalogStore;
  external_id: string | null;
  title: string;
  image_url: string | null;
  /** Hand-off into the ordinary quote flow: `/app/orders/new?url=`. */
  product_url: string;
  price_usd: number | null;
  currency: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  /** When the scraper last read this listing. Decides how old the price is. */
  last_seen_at: string;
  /** Landed GH₵ for quantity 1, or null when the engine could not price it. */
  total_ghs: number | null;
  pricing_group: string | null;
  pricing_method: string | null;
  exchange_rate: number | null;
  /** No listed price, or the engine refused it. Never print a figure for these. */
  unpriceable: boolean;
  /** Lowest landed total among this store's results in this response. */
  cheapest_in_store: boolean;
}

/** The `data` envelope of `GET /api/catalog/search`. */
export interface CatalogSearchPayload {
  query: string;
  count: number;
  results: CatalogProduct[];
}
