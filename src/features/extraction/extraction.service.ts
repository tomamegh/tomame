import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceResult } from "@/types/domain";
import type { OrderPricingBreakdown } from "@/types/db";
import { logger } from "@/lib/logger";
import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { matchProduct } from "@/features/pricing/services/static-pricing.service";
import { resolvePlatform, getScraperByPlatform } from "./scrapers";
import type { ExtractionResult, StaticPriceMatch } from "./types";

/** Cache TTL: 5 hours in milliseconds */
const CACHE_TTL_MS = 5 * 60 * 60 * 1000;

/** Pricing quote TTL: 24 hours in milliseconds */
const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

const DOMAIN_COUNTRY_MAP: Record<string, "USA" | "UK" | "CHINA"> = {
  "amazon.com": "USA",
  "amazon.ca": "USA",
  "amazon.co.uk": "UK",
  "amazon.de": "UK",
  "amazon.fr": "UK",
  "amazon.es": "UK",
  "amazon.it": "UK",
  "amazon.com.au": "USA",
  "amazon.in": "CHINA",
  "amazon.co.jp": "CHINA",
  "a.co": "USA", // Amazon short URL defaults to USA
  "ebay.com": "USA",
  "ebay.co.uk": "UK",
  "walmart.com": "USA",
  "target.com": "USA",
  "costco.com": "USA",
  "fashionnova.com": "USA",
  "bestbuy.com": "USA",
  "argos.co.uk": "UK",
  "aliexpress.com": "CHINA",
  "alibaba.com": "CHINA",
  "temu.com": "CHINA",
  "shein.com": "CHINA",
};

function getCountryFromDomain(url: string): "USA" | "UK" | "CHINA" | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [domain, country] of Object.entries(DOMAIN_COUNTRY_MAP)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return country;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Simple SHA-256 hash of the normalized URL string. */
export function hashUrl(url: string): string {
  const normalized = url.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

// ── Cache queries ────────────────────────────────────────────────────

async function getCachedExtraction(
  client: SupabaseClient,
  userId: string,
  urlHash: string,
): Promise<ExtractionResult | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  const { data, error } = await client
    .from("extraction_cache")
    .select("extraction_data, created_at")
    .eq("user_id", userId)
    .eq("url_hash", urlHash)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("getCachedExtraction failed", { userId, urlHash, error: error.message });
    return null;
  }

  if (!data) return null;

  return data.extraction_data as ExtractionResult;
}

async function upsertExtractionCache(
  client: SupabaseClient,
  userId: string,
  urlHash: string,
  productUrl: string,
  platform: string,
  country: string | null,
  extractionData: ExtractionResult,
  pricingQuote: OrderPricingBreakdown | null,
): Promise<void> {
  const { error } = await client
    .from("extraction_cache")
    .upsert(
      {
        user_id: userId,
        url_hash: urlHash,
        product_url: productUrl,
        platform,
        country,
        extraction_data: extractionData,
        pricing_quote: pricingQuote,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,url_hash" },
    );

  if (error) {
    // Cache write failure is non-critical — log but don't fail the request
    logger.error("upsertExtractionCache failed", { userId, urlHash, error: error.message });
  }
}

// ── Pricing quote lookup ──────────────────────────────────────────────

/**
 * Retrieve a cached pricing quote for a product URL.
 * Valid for 24 hours from generation. Returns null if expired or missing.
 * Used at order creation to honour the locked-in FX rate / fees.
 */
export async function getCachedPricingQuote(
  client: SupabaseClient,
  userId: string,
  url: string,
): Promise<OrderPricingBreakdown | null> {
  const urlHash = hashUrl(url);
  const cutoff = new Date(Date.now() - QUOTE_TTL_MS).toISOString();

  const { data, error } = await client
    .from("extraction_cache")
    .select("pricing_quote, created_at")
    .eq("user_id", userId)
    .eq("url_hash", urlHash)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("getCachedPricingQuote failed", { userId, urlHash, error: error.message });
    return null;
  }

  if (!data?.pricing_quote) return null;

  return data.pricing_quote as OrderPricingBreakdown;
}

// ── Main service ─────────────────────────────────────────────────────

export async function extractProductData(
  url: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<ServiceResult<ExtractionResult>> {
  const errors: string[] = [];

  // 1. Resolve platform
  const platform = resolvePlatform(url);
  if (!platform) {
    return {
      success: false,
      error: "Unsupported platform",
      status: 400,
    };
  }

  const urlHash = hashUrl(url);

  // 2. Check cache — return cached result if within 5-hour TTL
  const cached = await getCachedExtraction(supabase, userId, urlHash);
  if (cached) {
    logger.info("extraction cache hit", { userId, urlHash, platform });
    return { success: true, data: cached };
  }

  // 3. Get the platform-specific scraper and scrape
  const scraper = getScraperByPlatform(platform);

  try {
    const product = await scraper.scrape(url);

    const extractionSuccess = product.title !== null || product.price !== null;
    if (!extractionSuccess) {
      errors.push("Could not extract product name or price from page");
    }

    const country = getCountryFromDomain(url);

    // 4. Calculate pricing quote to lock in the current FX rate (valid 24h)
    let pricingQuote: OrderPricingBreakdown | null = null;
    if (product.price != null && country) {
      const pricingResult = await calculatePricing(product.price, 1, country);
      if (pricingResult.success) {
        pricingQuote = pricingResult.data;
      }
    }

    // 5. Try to match against static price list (fixed freight)
    let staticPriceMatch: StaticPriceMatch | null = null;
    const matchResult = await matchProduct({
      title: product.title,
      category: product.category,
      sku: (product.metadata?.["sku"] as string) ?? null,
      asin: (product.metadata?.["asin"] as string) ?? null,
    });
    if (matchResult.success && matchResult.data) {
      staticPriceMatch = {
        id: matchResult.data.id,
        category: matchResult.data.category,
        productName: matchResult.data.productName,
        priceGhs: matchResult.data.priceGhs,
        priceMinGhs: matchResult.data.priceMinGhs,
        priceMaxGhs: matchResult.data.priceMaxGhs,
      };
      logger.info("Static price match found", {
        title: product.title,
        matchedTo: matchResult.data.productName,
        priceGhs: matchResult.data.priceGhs,
      });
    }

    const result: ExtractionResult = {
      extractionAttempted: true,
      extractionSuccess,
      platform,
      country,
      product,
      errors,
      fetchedAt: new Date().toISOString(),
      pricingQuote,
      staticPriceMatch,
    };

    // 5. Cache extraction + pricing quote (fire-and-forget, non-blocking)
    upsertExtractionCache(supabase, userId, urlHash, url, platform, country, result, pricingQuote).catch(
      () => {},
    );

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    logger.error("extractProductData failed", { url, platform, error: message });

    return {
      success: false,
      error: message,
      status: 502,
    };
  }
}
