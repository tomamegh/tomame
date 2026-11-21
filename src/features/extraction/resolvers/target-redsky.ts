import { logger } from "@/lib/logger";

import type { PartialProduct } from "./types";

/**
 * Target, read from its own product API (2026-09-30).
 *
 * Target's product page carries no price in its HTML: the browser asks
 * `redsky.target.com` for it after load. Every page-reading tier therefore
 * failed on Target, and Zyte's AI reader filled the gap with the REVIEW COUNT
 * ($11,534 for a $45 tumbler — 11,534 reviews). This asks the API the page
 * itself asks, with the key the page itself ships, for one TCIN.
 *
 * Direct first (fast, free); through ScraperAPI's residential proxies when
 * Target refuses our servers.
 */
const REDSKY = "https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1";
/** The public web key embedded in every target.com page. Not a secret. */
const WEB_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";

export function targetTcinOf(url: string): string | null {
  return url.match(/\/A-(\d{6,})/)?.[1] ?? null;
}

interface RedskyProduct {
  tcin?: string;
  price?: { current_retail?: number; current_retail_min?: number; current_retail_max?: number; formatted_current_price?: string };
  item?: {
    product_description?: { title?: string; downstream_description?: string };
    enrichment?: { image_info?: { primary_image?: { url?: string } } };
    primary_brand?: { name?: string };
  };
  ratings_and_reviews?: { statistics?: { rating?: { average?: number; count?: number } } };
  category?: { name?: string };
}

/** Pure mapping, tested. A price RANGE (variants) is left unset: the customer picks the variant. */
export function mapRedsky(product: RedskyProduct): PartialProduct {
  const p = product.price ?? {};
  const single = p.current_retail ?? (p.current_retail_min != null && p.current_retail_min === p.current_retail_max ? p.current_retail_min : undefined)
    ?? (p.current_retail_max == null ? p.current_retail_min : undefined);
  const text = (v: string | undefined) => (v ? v.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").trim() : null);
  const out: PartialProduct = {
    title: text(product.item?.product_description?.title),
    price: typeof single === "number" && single > 0 ? single : null,
    currency: "USD",
    image: product.item?.enrichment?.image_info?.primary_image?.url ?? null,
    brand: product.item?.primary_brand?.name ?? null,
    description: text(product.item?.product_description?.downstream_description)?.slice(0, 2000) ?? null,
    seller: "Target",
  };
  const rating = product.ratings_and_reviews?.statistics?.rating;
  if (rating?.average != null) out.rating = rating.average;
  if (rating?.count != null) out.review_count = rating.count;
  return out;
}

export async function fetchTargetProduct(url: string, timeoutMs: number): Promise<PartialProduct | null> {
  const tcin = targetTcinOf(url);
  if (!tcin) return null;
  const api = `${REDSKY}?key=${WEB_KEY}&tcin=${tcin}&pricing_store_id=3991&store_id=3991`;
  const attempts: Array<[string, string]> = [["direct", api]];
  // Loaded here, not at import: `lib/env` validates the whole environment on load.
  const { env } = await import("@/lib/env");
  const scraperKey = env.extraction.scraperApiKey;
  if (scraperKey) {
    attempts.push(["scraperapi", `https://api.scraperapi.com/?${new URLSearchParams({ api_key: scraperKey, url: api, country_code: "us", premium: "true" })}`]);
  }
  const deadline = Date.now() + timeoutMs;
  for (const [via, target] of attempts) {
    const left = deadline - Date.now();
    if (left < 1_500) break;
    try {
      const res = await fetch(target, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(Math.min(left, via === "direct" ? 6_000 : 12_000)) });
      if (!res.ok && res.status !== 206) {
        logger.info("target-redsky: non-OK", { via, status: res.status });
        continue;
      }
      const body = (await res.json()) as { data?: { product?: RedskyProduct } };
      const product = body.data?.product;
      if (!product) continue;
      logger.info("target-redsky: fetched", { via, tcin });
      return mapRedsky(product);
    } catch (err) {
      logger.info("target-redsky: failed", { via, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return null;
}

/** One row of Target's search API, as the finder reads it. */
export interface TargetSearchItem {
  tcin: string;
  title: string;
  productUrl: string;
  imageUrl: string | null;
  priceUsd: number | null;
}

interface RedskySearchProduct extends RedskyProduct {
  item?: RedskyProduct["item"] & { enrichment?: { buy_url?: string; image_info?: { primary_image?: { url?: string } } } };
}

/** Pure mapping, tested: a single price only (a range is a choice of variants), Target's own product link. */
export function mapRedskySearch(products: readonly RedskySearchProduct[]): TargetSearchItem[] {
  return products.flatMap((p) => {
    const mapped = mapRedsky(p);
    if (!p.tcin || !mapped.title) return [];
    const buy = p.item?.enrichment?.buy_url;
    return [{
      tcin: p.tcin,
      title: mapped.title,
      productUrl: buy && /^https:\/\/www\.target\.com\/p\//.test(buy) ? buy : `https://www.target.com/p/-/A-${p.tcin}`,
      imageUrl: mapped.image ?? null,
      priceUsd: mapped.price ?? null,
    }];
  });
}

/**
 * Target's own search, the API its search page calls, with the same public
 * key. Free and about a second (2026-11-21). Direct first, then through
 * ScraperAPI when Target refuses our servers. THROWS when neither answers.
 */
export async function searchTargetProducts(query: string, timeoutMs: number): Promise<TargetSearchItem[]> {
  const qs = new URLSearchParams({
    key: WEB_KEY,
    channel: "WEB",
    count: "24",
    default_purchasability_filter: "true",
    include_sponsored: "false",
    keyword: query,
    offset: "0",
    page: `/s/${query}`,
    platform: "desktop",
    pricing_store_id: "3991",
    visitor_id: "0193A0B0C0D0E0F0A0B0C0D0E0F0A0B0",
  });
  const api = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?${qs}`;
  const attempts: Array<[string, string]> = [["direct", api]];
  const { env } = await import("@/lib/env");
  const scraperKey = env.extraction.scraperApiKey;
  if (scraperKey) {
    attempts.push(["scraperapi", `https://api.scraperapi.com/?${new URLSearchParams({ api_key: scraperKey, url: api, country_code: "us", premium: "true" })}`]);
  }
  const deadline = Date.now() + timeoutMs;
  for (const [via, target] of attempts) {
    const left = deadline - Date.now();
    if (left < 1_500) break;
    try {
      const res = await fetch(target, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" },
        signal: AbortSignal.timeout(Math.min(left, via === "direct" ? 8_000 : 20_000)),
      });
      if (!res.ok && res.status !== 206) {
        logger.info("target-redsky: search non-OK", { via, status: res.status });
        continue;
      }
      const body = (await res.json()) as { data?: { search?: { products?: RedskySearchProduct[] } } };
      const products = body.data?.search?.products;
      if (!products) continue;
      logger.info("target-redsky: searched", { via, results: products.length });
      return mapRedskySearch(products);
    } catch (err) {
      logger.info("target-redsky: search failed", { via, error: err instanceof Error ? err.message : String(err) });
    }
  }
  throw new Error("Target search did not answer");
}
