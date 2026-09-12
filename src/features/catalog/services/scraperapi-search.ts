import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { CATALOG_JOB } from "@/config/catalog";
import { amazonAsinOf, ebayItemIdOf, hashUrl } from "@/features/extraction/url";
import { cleanString, normalizeImageUrl, parseRating, parseReviewCount } from "@/features/extraction/scrapers/parse";
import type { CatalogProductInput, CatalogStore } from "@/db/queries/catalog";

/**
 * ScraperAPI structured SEARCH endpoints — a category search page as JSON, one
 * credit per call. Confirmed live 2026-09-12 (docs.scraperapi.com →
 * Structured Data Endpoints):
 *
 *   GET https://api.scraperapi.com/structured/amazon/search
 *       ?api_key&query&country_code=us&tld=com
 *       → { results: [{ asin, name, image, url, price, price_string, stars, total_reviews, … }], next_pages }
 *
 *   GET https://api.scraperapi.com/structured/ebay/search/v2
 *       ?api_key&query&country_code=us&tld=com
 *       → { results: [{ product_title, image, product_url, condition,
 *                       item_price: { value, currency } | { from: { value, currency }, to: {…} },
 *                       seller_name, … }], next_pages }
 *
 * eBay search rows carry the SELLER's rating, not the product's, so rating and
 * review_count are null for eBay — the mapper never invents a value.
 */
const BASE = "https://api.scraperapi.com/structured";

export function isScraperApiConfigured(): boolean {
  return env.extraction.scraperApiKey !== null;
}

export interface ScraperApiAmazonSearchResult {
  type?: string;
  position?: number;
  asin?: string;
  name?: string;
  image?: string;
  url?: string;
  /** Numeric price; absent when the listing shows no price. */
  price?: number | string;
  price_string?: string;
  price_symbol?: string;
  stars?: number | string;
  total_reviews?: number | string;
  original_price?: { price?: number; price_string?: string; price_symbol?: string };
  is_best_seller?: boolean;
  is_amazon_choice?: boolean;
  has_prime?: boolean;
  [key: string]: unknown;
}

export interface EbayMoney {
  value?: number | string;
  currency?: string;
}

export interface ScraperApiEbaySearchResult {
  product_title?: string;
  image?: string;
  product_url?: string;
  condition?: string;
  /** Single price `{ value, currency }`, or a variant range `{ from: { value, currency }, to: {…} }`. */
  item_price?: { value?: number | string; currency?: string; from?: EbayMoney; to?: EbayMoney };
  extra_info?: string;
  shipping_cost?: string | number;
  seller_name?: string;
  seller_rating?: number | string;
  seller_rating_count?: number | string;
  [key: string]: unknown;
}

interface SearchEnvelope<T> {
  results?: T[];
  next_pages?: unknown;
}

export interface MapContext {
  queryId: string | null;
  category: string | null;
}

export interface CatalogSearchFetch {
  items: CatalogProductInput[];
  /** Result count before de-duplication and validation. */
  rawCount: number;
}

// ── mappers (pure) ──────────────────────────────────────────────────────────

const SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "¥": "CNY" };

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const m = v.match(/([\d,]+(?:\.\d{1,2})?)/);
  const n = m?.[1] ? parseFloat(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "USD" / "US $" / "$" → ISO code; unknown → fallback. */
function currencyOf(raw: unknown, fallback: string): string {
  const s = cleanString(raw);
  if (!s) return fallback;
  const code = s.toUpperCase().match(/\b(USD|GBP|EUR|CNY|CAD|AUD|JPY)\b/)?.[1];
  if (code) return code;
  const t = s.replace(/\s+/g, "");
  if (t.startsWith("US$") || t === "$") return "USD";
  if (t.startsWith("C$")) return "CAD";
  return SYMBOL_CURRENCY[t] ?? fallback;
}

/** Trim the vendor row to what we did not map, capped so `raw` stays small. */
function trimRaw(row: Record<string, unknown>, drop: readonly string[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!drop.includes(k) && v != null && v !== "" && !(typeof v === "object" && Object.keys(v as object).length === 0)) out[k] = v;
  }
  if (Object.keys(out).length === 0) return null;
  return JSON.stringify(out).length > CATALOG_JOB.maxRawBytes ? null : out;
}

/** Keep the first row per url_hash — Postgres rejects an upsert batch that hits one row twice. */
function dedupe(items: CatalogProductInput[]): CatalogProductInput[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.external_id ? `${it.store}:${it.external_id}` : it.url_hash;
    if (seen.has(key) || seen.has(it.url_hash)) return false;
    seen.add(key);
    seen.add(it.url_hash);
    return true;
  });
}

export function mapAmazonSearchResults(results: readonly ScraperApiAmazonSearchResult[], ctx: MapContext): CatalogProductInput[] {
  const items: CatalogProductInput[] = [];
  for (const r of results) {
    const title = cleanString(r.name);
    const asin = cleanString(r.asin)?.toUpperCase() ?? (r.url ? amazonAsinOf(r.url) : null);
    if (!title || !asin || !/^[A-Z0-9]{10}$/.test(asin)) continue;
    // Search URLs carry tracking (`ref=sr_1_1`, `qid`, ad redirects on
    // aax-*.amazon.com). The ASIN is the identity, so the stored URL is the
    // canonical product page — the same one a customer would paste.
    const productUrl = `https://www.amazon.com/dp/${asin}`;
    items.push({
      store: "amazon",
      external_id: asin,
      product_url: productUrl,
      url_hash: hashUrl(productUrl),
      title,
      image_url: normalizeImageUrl(r.image),
      price_usd: toNumber(r.price) ?? toNumber(r.price_string),
      currency: currencyOf(r.price_symbol, "USD"),
      rating: parseRating(r.stars),
      review_count: parseReviewCount(r.total_reviews),
      category: ctx.category,
      query_id: ctx.queryId,
      raw: trimRaw(r, ["type", "position", "asin", "name", "image", "url", "price", "price_string", "price_symbol", "stars", "total_reviews", "spec"]),
    });
  }
  return dedupe(items);
}

export function mapEbaySearchResults(results: readonly ScraperApiEbaySearchResult[], ctx: MapContext): CatalogProductInput[] {
  const items: CatalogProductInput[] = [];
  for (const r of results) {
    const title = cleanString(r.product_title);
    const url = cleanString(r.product_url);
    if (!title || !url) continue;
    const itemId = ebayItemIdOf(url);
    // Canonical listing URL when we know the id; otherwise the vendor's URL minus tracking (hashUrl strips it).
    const productUrl = itemId ? `https://www.ebay.com/itm/${itemId}` : url;
    const price = r.item_price ?? {};
    // A "from–to" range is a multi-variant listing; the low end is what the
    // customer sees first and what "cheapest option" should compare.
    const low = price.from && typeof price.from === "object" ? price.from : null;
    const priceValue = toNumber(price.value) ?? toNumber(low?.value);
    const priceCurrency = price.value != null ? price.currency : low?.currency;
    items.push({
      store: "ebay",
      external_id: itemId,
      product_url: productUrl,
      url_hash: hashUrl(productUrl),
      title,
      image_url: normalizeImageUrl(r.image),
      price_usd: priceValue,
      currency: priceValue != null ? currencyOf(priceCurrency, "USD") : null,
      rating: null,
      review_count: null,
      category: ctx.category,
      query_id: ctx.queryId,
      raw: trimRaw(r, ["product_title", "image", "product_url", "item_price"]),
    });
  }
  return dedupe(items);
}

// ── vendor call ─────────────────────────────────────────────────────────────

/**
 * One search page for one store. THROWS on any vendor failure — the caller
 * counts the credit either way and records the failure against the query.
 */
export async function fetchCatalogSearch(store: CatalogStore, query: string, ctx: MapContext): Promise<CatalogSearchFetch> {
  const apiKey = env.extraction.scraperApiKey;
  if (!apiKey) throw new Error("ScraperAPI is not configured (SCRAPERAPI_API_KEY)");

  const path = store === "amazon" ? "amazon/search" : "ebay/search/v2";
  const qs = new URLSearchParams({ api_key: apiKey, query, country_code: "us", tld: "com" });
  const t0 = Date.now();

  const res = await fetch(`${BASE}/${path}?${qs.toString()}`, { signal: AbortSignal.timeout(CATALOG_JOB.vendorTimeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ScraperAPI ${store} search failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as SearchEnvelope<unknown> | unknown[];
  const results = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : null;
  if (!results) throw new Error(`ScraperAPI ${store} search returned no results array`);

  const items =
    store === "amazon"
      ? mapAmazonSearchResults(results as ScraperApiAmazonSearchResult[], ctx)
      : mapEbaySearchResults(results as ScraperApiEbaySearchResult[], ctx);

  logger.info("catalog: vendor search fetched", { store, query, rawCount: results.length, mapped: items.length, ms: Date.now() - t0 });
  return { items, rawCount: results.length };
}
