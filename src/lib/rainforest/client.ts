import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";

/**
 * Rainforest API (Traject Data) — structured Amazon product data by ASIN.
 * https://docs.trajectdata.com/rainforestapi/product-data-api/overview
 *
 * One credit per request, 1–6 s typical. Optional tier: skipped when
 * RAINFOREST_API_KEY is unset. This is what makes an Amazon quote answer in a
 * few seconds instead of a headless-browser render.
 */
const RAINFOREST_URL = "https://api.rainforestapi.com/request";

export function isRainforestConfigured(): boolean {
  return env.extraction.rainforestApiKey !== null;
}

export interface RainforestPrice {
  symbol?: string;
  value?: number;
  currency?: string;
  raw?: string;
}

export interface RainforestProduct {
  asin?: string;
  title?: string;
  brand?: string;
  link?: string;
  description?: string;
  feature_bullets?: string[];
  main_image?: { link?: string };
  images?: Array<{ link?: string }>;
  categories?: Array<{ name?: string; link?: string }>;
  specifications?: Array<{ name?: string; value?: string }>;
  /** e.g. "36.2 pounds" */
  weight?: string;
  /** e.g. "19.8 x 20.5 x 47.8 inches" */
  dimensions?: string;
  rating?: number;
  ratings_total?: number;
  buybox_winner?: {
    price?: RainforestPrice;
    rrp?: RainforestPrice;
    is_prime?: boolean;
    availability?: { type?: string; raw?: string };
    condition?: { is_new?: boolean };
    fulfillment?: { is_sold_by_amazon?: boolean; is_fulfilled_by_amazon?: boolean; third_party_seller?: { name?: string } };
  };
  [key: string]: unknown;
}

export interface RainforestResponse {
  request_info?: { success?: boolean; credits_used?: number; credits_remaining?: number; message?: string };
  product?: RainforestProduct;
  [key: string]: unknown;
}

/**
 * Fetch one product. Returns null on any failure — the resolver chain treats
 * null as "didn't know" and moves on to the browser tiers.
 */
export async function fetchAmazonProduct(asin: string, amazonDomain: string): Promise<RainforestProduct | null> {
  const apiKey = env.extraction.rainforestApiKey;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    api_key: apiKey,
    type: "product",
    asin,
    amazon_domain: amazonDomain,
    // Skips Rainforest's own GTIN lookup detour; we only need the page data.
    include_summarization_attributes: "false",
  });

  const t0 = Date.now();
  try {
    const res = await fetch(`${RAINFOREST_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(EXTRACTION.rainforestTimeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("rainforest: request failed", { asin, amazonDomain, status: res.status, body: body.slice(0, 300) });
      return null;
    }
    const data = (await res.json()) as RainforestResponse;
    if (!data.request_info?.success || !data.product) {
      logger.warn("rainforest: unsuccessful response", { asin, amazonDomain, message: data.request_info?.message ?? null });
      return null;
    }
    logger.info("rainforest: product fetched", {
      asin,
      amazonDomain,
      ms: Date.now() - t0,
      credits_remaining: data.request_info.credits_remaining ?? null,
    });
    return data.product;
  } catch (err) {
    logger.warn("rainforest: exception", { asin, amazonDomain, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
