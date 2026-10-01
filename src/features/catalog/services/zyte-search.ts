import { logger } from "@/lib/logger";
import { CATALOG_JOB } from "@/config/catalog";
import { fetchZyteProductList, isZyteConfigured, type ZyteProductFromList } from "@/lib/zyte/client";
import { hashUrl } from "@/features/extraction/url";
import { cleanString, normalizeImageUrl, salePrice } from "@/features/extraction/scrapers/parse";
import type { CatalogProductInput, CatalogStore } from "@/db/queries/catalog";
import { currencyOf, dedupe, toNumber, trimRaw, type CatalogSearchFetch, type MapContext } from "./scraperapi-search";

/**
 * Catalogue search for stores no structured search endpoint covers (Etsy,
 * Nike): Zyte's AI `productList` extraction run on the store's OWN search
 * page. One Zyte request per call.
 *
 * A search card carries name, price, currency, URL and image, and nothing
 * else: no rating, no review count, no weight. The mapper stores what is
 * there and never invents the rest.
 */
export type ZyteSearchStore = Extract<CatalogStore, "etsy" | "nike">;

export function isZyteSearchStore(store: CatalogStore): store is ZyteSearchStore {
  return store === "etsy" || store === "nike";
}

export { isZyteConfigured };

/** The store's own search page for a term. */
export function zyteSearchUrl(store: ZyteSearchStore, query: string): string {
  const q = encodeURIComponent(query.trim()).replace(/%20/g, "+");
  return store === "etsy" ? `https://www.etsy.com/search?q=${q}` : `https://www.nike.com/w?q=${q}`;
}

/**
 * The listing's identity and canonical URL, or null when the card is not a
 * product page the paste flow can read (`productPath` in the store registry).
 *
 *   Etsy  /listing/<id>/<slug>?click_key=…  →  https://www.etsy.com/listing/<id>
 *   Nike  /t/<slug>/<STYLE-CODE>?…          →  https://www.nike.com/t/<slug>/<STYLE-CODE>
 */
export function canonicalZyteListing(store: ZyteSearchStore, raw: string): { id: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (store === "etsy") {
    if (!(host === "etsy.com" || host.endsWith(".etsy.com"))) return null;
    const id = u.pathname.match(/\/listing\/(\d+)/)?.[1];
    return id ? { id, url: `https://www.etsy.com/listing/${id}` } : null;
  }
  if (!(host === "nike.com" || host.endsWith(".nike.com"))) return null;
  const m = u.pathname.match(/^\/t\/([^/]+)\/([A-Z0-9-]+)\/?$/i);
  if (!m?.[1] || !m[2]) return null;
  const style = m[2].toUpperCase();
  return { id: style, url: `https://www.nike.com/t/${m[1]}/${style}` };
}

export function mapZyteProductList(store: ZyteSearchStore, products: readonly ZyteProductFromList[], ctx: MapContext): CatalogProductInput[] {
  const items: CatalogProductInput[] = [];
  for (const p of products) {
    const title = cleanString(p.name);
    const url = cleanString(p.url);
    if (!title || !url) continue;
    const listing = canonicalZyteListing(store, url);
    if (!listing) continue;
    // Same rule as product pages: a "regular" below the price is the two swapped.
    const { price } = salePrice(toNumber(p.price), toNumber(p.regularPrice));
    items.push({
      store,
      external_id: listing.id,
      product_url: listing.url,
      url_hash: hashUrl(listing.url),
      title,
      image_url: normalizeImageUrl(p.mainImage?.url),
      price_usd: price,
      currency: price != null ? (cleanString(p.currency)?.toUpperCase() ?? currencyOf(p.currencyRaw, "USD")) : null,
      rating: null,
      review_count: null,
      category: ctx.category,
      query_id: ctx.queryId,
      raw: trimRaw(p, ["url", "name", "price", "currency", "currencyRaw", "mainImage", "metadata"]),
    });
  }
  return dedupe(items);
}

/** One search page through Zyte. THROWS on failure, as `fetchCatalogSearch` does. */
export async function fetchZyteCatalogSearch(store: ZyteSearchStore, query: string, ctx: MapContext): Promise<CatalogSearchFetch> {
  if (!isZyteConfigured()) throw new Error("Zyte is not configured (ZYTE_API_KEY)");
  const t0 = Date.now();
  const list = await fetchZyteProductList(zyteSearchUrl(store, query), {
    timeoutMs: CATALOG_JOB.vendorTimeoutMs,
    geolocation: "US",
  });
  if (!list) throw new Error(`Zyte ${store} search returned no product list`);
  const products = list.products ?? [];
  const items = mapZyteProductList(store, products, ctx);
  logger.info("catalog: vendor search fetched", { store, query, rawCount: products.length, mapped: items.length, ms: Date.now() - t0 });
  return { items, rawCount: products.length };
}
