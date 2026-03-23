import { createHash } from "crypto";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePlatform, getScraperByPlatform } from "./scrapers";
import type { ExtractionResult } from "./types";

const CACHE_TTL_MINUTES = 30;

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
  "a.co": "USA",
  "ebay.com": "USA",
  "ebay.co.uk": "UK",
  "walmart.com": "USA",
  "target.com": "USA",
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

// ── URL hashing ────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Drop tracking params that don't affect the product
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "tag"].forEach(
      (p) => u.searchParams.delete(p),
    );
    u.searchParams.sort();
    return u.toString().replace(/\/+$/, "");
  } catch {
    return raw.trim().toLowerCase();
  }
}

function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

// ── Cache helpers ──────────────────────────────────────────────────────────

interface CachedExtraction {
  id: string;
  result: ExtractionResult;
}

async function getCachedExtraction(urlHash: string): Promise<CachedExtraction | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("extraction_cache")
      .select("id, result")
      .eq("url_hash", urlHash)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;
    return { id: data.id as string, result: data.result as ExtractionResult };
  } catch (err) {
    logger.warn("extraction cache read failed", { error: err });
    return null;
  }
}

async function setCachedExtraction(
  urlHash: string,
  productUrl: string,
  result: ExtractionResult,
): Promise<string | null> {
  try {
    const db = createAdminClient();
    const expiresAt = new Date(Date.now() + CACHE_TTL_MINUTES * 60 * 1000).toISOString();

    const { data, error } = await db
      .from("extraction_cache")
      .upsert(
        {
          url_hash: urlHash,
          product_url: productUrl,
          result,
          is_valid: true,
          expires_at: expiresAt,
        },
        { onConflict: "url_hash" },
      )
      .select("id")
      .single();

    if (error || !data) return null;
    return data.id as string;
  } catch (err) {
    logger.warn("extraction cache write failed", { error: err });
    return null;
  }
}

// ── Main extraction ────────────────────────────────────────────────────────

export interface ExtractionResponse extends ExtractionResult {
  extraction_cache_id: string | null;
}

export async function extractProductData(url: string): Promise<ExtractionResponse> {
  const urlHash = hashUrl(url);

  // Check cache first
  const cached = await getCachedExtraction(urlHash);
  if (cached) {
    logger.info("extraction cache hit", { url, urlHash });
    return { ...cached.result, extraction_cache_id: cached.id };
  }

  const errors: string[] = [];

  const platform = resolvePlatform(url);
  if (!platform) {
    throw new APIError(400, "Unsupported platform");
  }

  const scraper = getScraperByPlatform(platform);

  try {
    const product = await scraper.scrape(url);

    const extractionSuccess = product.title !== null || product.price !== null;
    if (!extractionSuccess) {
      errors.push("Could not extract product name or price from page");
    }

    const result: ExtractionResult = {
      extraction_attempted: true,
      extraction_success: extractionSuccess,
      platform,
      country: getCountryFromDomain(url),
      product,
      errors,
      fetched_at: new Date().toISOString(),
    };

    // Only cache successful extractions
    let cacheId: string | null = null;
    if (extractionSuccess) {
      cacheId = await setCachedExtraction(urlHash, url, result);
    }

    return { ...result, extraction_cache_id: cacheId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    logger.error("extractProductData failed", { url, platform, error: message });
    throw new APIError(502, message);
  }
}
