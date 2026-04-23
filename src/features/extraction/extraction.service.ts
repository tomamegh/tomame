import { createHash } from "crypto";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePlatform, getScraperByPlatform } from "./scrapers";
import type { CachedExtraction, ExtractionResult } from "./types";

const CACHE_TTL_MINUTES = 30;

const DOMAIN_COUNTRY_MAP: Record<string, "USA" | "UK" | "CHINA"> = {
  // Amazon — US only for now
  "amazon.com": "USA",
  // Future: "amazon.co.uk": "UK", "amazon.ca": "USA", "amazon.de": "UK", etc.

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

async function getCachedExtraction(userId: string, urlHash: string): Promise<CachedExtraction | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("extraction_cache")
      .select("id, result")
      .eq("user_id", userId)
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
  userId: string,
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
          user_id: userId,
          url_hash: urlHash,
          product_url: productUrl,
          result,
          is_valid: true,
          expires_at: expiresAt,
        },
        { onConflict: "user_id,url_hash" },
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

/**
 * Resolve a short URL (e.g. a.co) to its final destination so we can
 * determine the actual domain for country mapping.
 */
async function resolveShortUrl(shortUrl: string): Promise<string> {
  try {
    const res = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    return res.url || shortUrl;
  } catch {
    return shortUrl;
  }
}

const SHORT_URL_HOSTS = new Set(["a.co"]);

export async function extractProductData(url: string, userId: string): Promise<ExtractionResponse> {
  // Resolve short URLs up-front so country detection uses the real domain
  let resolvedUrl = url;
  try {
    if (SHORT_URL_HOSTS.has(new URL(url).hostname.toLowerCase())) {
      resolvedUrl = await resolveShortUrl(url);
      logger.info("resolved short URL", { from: url, to: resolvedUrl });
    }
  } catch {
    // If URL parsing fails, continue with original
  }

  const urlHash = hashUrl(url);

  // Check cache first (scoped to user)
  const cached = await getCachedExtraction(userId, urlHash);
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
  const country = getCountryFromDomain(resolvedUrl);

  try {
    const product = await scraper.scrape(url);

    const extractionSuccess = product.title !== null || product.price !== null;
    if (!extractionSuccess) {
      errors.push("Could not extract product name or price from page");
    }

    if (!country) {
      errors.push("This region is not currently supported.");
    }

    const result: ExtractionResult = {
      extraction_attempted: true,
      extraction_success: extractionSuccess,
      platform,
      country,
      product,
      errors,
      fetched_at: new Date().toISOString(),
    };

    // Only cache successful extractions
    let cacheId: string | null = null;
    if (extractionSuccess) {
      cacheId = await setCachedExtraction(userId, urlHash, url, result);
    }

    return { ...result, extraction_cache_id: cacheId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    logger.error("extractProductData failed", { url, platform, error: message, _error: err });
    throw new APIError(502, message);
  }
}
