import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";

/**
 * Oxylabs Web Scraper API — realtime endpoint. One POST, one parsed product.
 * https://developers.oxylabs.io/ → API Targets → E-Commerce
 *
 * Verified live 2026-09-12: amazon_product 5–6.5 s (with item_weight),
 * walmart_product 2.5–4.5 s (breadcrumbs + specifications). bestbuy_product,
 * target_product, ebay_product and aliexpress all returned parse_status 12003
 * (parser failed) or rate limits — not wired.
 *
 * Optional tier: skipped when OXYLABS_USERNAME / OXYLABS_PASSWORD are unset.
 */
const REALTIME = "https://realtime.oxylabs.io/v1/queries";
const PARSE_OK = 12000;

export function isOxylabsConfigured(): boolean {
  return env.extraction.oxylabsUsername !== null && env.extraction.oxylabsPassword !== null;
}

export interface OxylabsAmazonProduct {
  title?: string;
  product_name?: string;
  asin?: string;
  brand?: string;
  manufacturer?: string;
  price?: number;
  price_buybox?: number;
  price_strikethrough?: number;
  currency?: string;
  stock?: string;
  images?: string[];
  /** Breadcrumb ladder; often [] on stores/brand pages. */
  category?: Array<{ ladder?: Array<{ name?: string; url?: string }> }>;
  bullet_points?: string;
  description?: string;
  product_dimensions?: string;
  /** snake_case keys, e.g. item_weight: "2.46 ounces". */
  product_details?: Record<string, string>;
  technical_details?: Array<{ name?: string; value?: string }>;
  product_overview?: Array<{ title?: string; description?: string }>;
  variation?: Array<{ asin?: string; dimensions?: Record<string, string>; selected?: boolean }>;
  rating?: number;
  reviews_count?: number;
  featured_merchant?: { name?: string; is_amazon_fulfilled?: boolean };
  parse_status_code?: number;
  [key: string]: unknown;
}

export interface OxylabsWalmartProduct {
  general?: {
    title?: string;
    brand?: string;
    description?: string;
    main_image?: string;
    images?: string[];
    meta?: { sku?: string; gtin?: string };
    [key: string]: unknown;
  };
  price?: { price?: number; currency?: string; price_strikethrough?: number };
  breadcrumbs?: Array<{ category_name?: string; url?: string }>;
  specifications?: Array<{ key?: string; value?: string }>;
  fulfillment?: { out_of_stock?: boolean; shipping?: boolean; [key: string]: unknown };
  variations?: Array<{ product_id?: string; selected_options?: Array<{ key?: string; value?: string }>; state?: string }>;
  rating?: { count?: number; rating?: number };
  seller?: { name?: string };
  parse_status_code?: number;
  [key: string]: unknown;
}

interface RealtimeResponse<T> {
  results?: Array<{ content?: T | string; status_code?: number; parse_status_code?: number }>;
  message?: string;
}

async function query<T>(body: Record<string, unknown>, label: string, signal?: AbortSignal): Promise<T | null> {
  const user = env.extraction.oxylabsUsername;
  const pass = env.extraction.oxylabsPassword;
  if (!user || !pass) return null;
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(EXTRACTION.oxylabsTimeoutMs);
  try {
    const res = await fetch(REALTIME, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("oxylabs: request failed", { label, source: body.source, status: res.status, body: text.slice(0, 200), ms: Date.now() - t0 });
      return null;
    }
    const data = (await res.json()) as RealtimeResponse<T>;
    const result = data.results?.[0];
    const content = result?.content;
    if (!content || typeof content === "string") {
      logger.warn("oxylabs: no parsed content", { label, source: body.source, ms: Date.now() - t0 });
      return null;
    }
    const parseStatus = Number((content as { parse_status_code?: number | string }).parse_status_code ?? result?.parse_status_code ?? PARSE_OK);
    if (parseStatus !== PARSE_OK) {
      logger.warn("oxylabs: parser failed", { label, source: body.source, parseStatus, ms: Date.now() - t0 });
      return null;
    }
    logger.info("oxylabs: fetched", { label, source: body.source, ms: Date.now() - t0 });
    return content;
  } catch (err) {
    if (signal?.aborted) return null;
    logger.warn("oxylabs: exception", { label, source: body.source, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 });
    return null;
  }
}

/** `domain` is the marketplace suffix ("com", "co.uk"). */
export async function fetchOxylabsAmazonProduct(asin: string, domain: string, signal?: AbortSignal): Promise<OxylabsAmazonProduct | null> {
  const data = await query<OxylabsAmazonProduct>({ source: "amazon_product", query: asin, domain, parse: true }, asin, signal);
  return data?.title || data?.product_name ? data : null;
}

export async function fetchOxylabsWalmartProduct(productId: string, signal?: AbortSignal): Promise<OxylabsWalmartProduct | null> {
  const data = await query<OxylabsWalmartProduct>({ source: "walmart_product", product_id: productId, parse: true }, productId, signal);
  return data?.general?.title ? data : null;
}

/**
 * Rendered HTML of any URL through Oxylabs' proxy pool. Slower than Zyte
 * (~10 s for Walmart) — an HTML source of last resort for stores whose own
 * fetch paths are blocked.
 */
export async function fetchOxylabsRenderedHtml(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string | null> {
  const user = env.extraction.oxylabsUsername;
  const pass = env.extraction.oxylabsPassword;
  if (!user || !pass) return null;
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(REALTIME, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
      },
      body: JSON.stringify({ source: "universal", url, render: "html" }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      logger.warn("oxylabs: render failed", { url, status: res.status, ms: Date.now() - t0 });
      return null;
    }
    const data = (await res.json()) as RealtimeResponse<string>;
    const html = data.results?.[0]?.content;
    logger.info("oxylabs: rendered", { url, ms: Date.now() - t0, bytes: typeof html === "string" ? html.length : 0 });
    return typeof html === "string" && html.length > 500 ? html : null;
  } catch (err) {
    if (!signal?.aborted) logger.warn("oxylabs: render exception", { url, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
