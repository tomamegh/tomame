import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";

/**
 * ScraperAPI structured data endpoints — product JSON by identifier, no
 * browser. Measured live 2026-09-09: eBay 2–5 s, Amazon 3–4 s.
 * https://docs.scraperapi.com/ → Structured Data Endpoints
 *
 * Optional tier: skipped when SCRAPERAPI_API_KEY is unset.
 */
const BASE = "https://api.scraperapi.com/structured";

export function isScraperApiConfigured(): boolean {
  return env.extraction.scraperApiKey !== null;
}

export interface ScraperApiAmazonProduct {
  name?: string;
  /** e.g. "$80.74" */
  pricing?: string;
  list_price?: string;
  /** e.g. "Visit the Homall Store" */
  brand?: string;
  availability_status?: string;
  images?: string[];
  high_res_images?: string[];
  /** e.g. "Home & Kitchen›Furniture›Gaming Chairs" */
  product_category?: string;
  feature_bullets?: string[];
  full_description?: string;
  /** snake_case keys, e.g. item_weight: "36.2 pounds" */
  product_information?: Record<string, string>;
  average_rating?: number;
  total_reviews?: number;
  sold_by?: string;
  [key: string]: unknown;
}

export interface ScraperApiEbayProduct {
  product_id_epid?: string;
  title?: string;
  price?: { value?: number; currency?: string };
  images?: string[];
  available?: boolean;
  available_quantity?: number;
  condition?: string;
  brand?: string;
  model?: string;
  color?: string;
  item_specifics?: Array<{ label?: string; value?: string }>;
  seller?: { name?: string; seller_url?: string };
  /** `value` is per unit in the listing currency; `currency` is unreliable scraped text ("delivery in – days"). */
  shipping_costs?: { value?: number | string; currency?: string };
  rating?: number;
  review_count?: number;
  [key: string]: unknown;
}

async function get<T>(path: string, params: Record<string, string>, label: string): Promise<T | null> {
  const apiKey = env.extraction.scraperApiKey;
  if (!apiKey) return null;
  const qs = new URLSearchParams({ api_key: apiKey, ...params });
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/${path}?${qs.toString()}`, { signal: AbortSignal.timeout(EXTRACTION.scraperApiTimeoutMs) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("scraperapi: request failed", { path, label, status: res.status, body: body.slice(0, 200) });
      return null;
    }
    const data = (await res.json()) as T;
    logger.info("scraperapi: fetched", { path, label, ms: Date.now() - t0 });
    return data;
  } catch (err) {
    logger.warn("scraperapi: exception", { path, label, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** `tld` is the marketplace suffix ("com", "co.uk"); `country` the proxy geo. */
export async function fetchAmazonProductStructured(asin: string, tld: string, country: string): Promise<ScraperApiAmazonProduct | null> {
  const data = await get<ScraperApiAmazonProduct>("amazon/product", { asin, tld, country }, asin);
  return data?.name ? data : null;
}

export async function fetchEbayProductStructured(productId: string, country: string): Promise<ScraperApiEbayProduct | null> {
  const data = await get<ScraperApiEbayProduct>("ebay/product", { product_id: productId, country }, productId);
  return data?.title ? data : null;
}

/**
 * A product PAGE through ScraperAPI's proxy API — any store, not just the
 * structured Amazon/eBay endpoints above. Paid plan since 2026-09-29 (100k
 * credits/month), which is what makes this a real tier rather than a luxury.
 *
 * `render` runs a headless browser (for pages built client-side); `premium`
 * routes through residential proxies (for stores that block datacenter IPs —
 * the ones we had marked "blocked"). Credits per call, from ScraperAPI's
 * pricing: plain 1, render 10, premium 10, premium + render 25, ultra premium 30.
 */
export async function fetchScraperApiHtml(
  url: string,
  timeoutMs: number,
  opts: { render?: boolean; premium?: boolean; ultraPremium?: boolean; countryCode?: string } = {},
): Promise<string | null> {
  const apiKey = env.extraction.scraperApiKey;
  if (!apiKey) return null;
  const qs = new URLSearchParams({ api_key: apiKey, url, country_code: opts.countryCode ?? "us" });
  if (opts.render) qs.set("render", "true");
  if (opts.premium) qs.set("premium", "true");
  if (opts.ultraPremium) qs.set("ultra_premium", "true");
  const t0 = Date.now();
  try {
    const res = await fetch(`https://api.scraperapi.com/?${qs.toString()}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      logger.warn("scraperapi: page fetch failed", { host: safeHost(url), status: res.status, render: !!opts.render, premium: !!opts.premium });
      return null;
    }
    const html = await res.text();
    logger.info("scraperapi: page fetched", { host: safeHost(url), ms: Date.now() - t0, bytes: html.length, render: !!opts.render, premium: !!opts.premium });
    return html.length > 500 ? html : null;
  } catch (err) {
    logger.warn("scraperapi: page fetch exception", { host: safeHost(url), error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
