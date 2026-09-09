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
  shipping_costs?: { value?: number; currency?: string };
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
