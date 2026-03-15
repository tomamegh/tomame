import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceResult } from "@/types/domain";
import { logger } from "@/lib/logger";
import { resolvePlatform, getScraperByPlatform } from "./scrapers";
import type { ExtractionResult } from "./types";

/** Cache TTL: 5 hours in milliseconds */
const CACHE_TTL_MS = 5 * 60 * 60 * 1000;

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
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,url_hash" },
    );

  if (error) {
    // Cache write failure is non-critical — log but don't fail the request
    logger.error("upsertExtractionCache failed", { userId, urlHash, error: error.message });
  }
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

    const result: ExtractionResult = {
      extractionAttempted: true,
      extractionSuccess,
      platform,
      country,
      product,
      errors,
      fetchedAt: new Date().toISOString(),
    };

    // 4. Cache the result (fire-and-forget, non-blocking)
    upsertExtractionCache(supabase, userId, urlHash, url, platform, country, result).catch(
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
