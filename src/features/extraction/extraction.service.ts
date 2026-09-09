import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { getCachedExtractionByHash, getExtractionById, upsertExtractionCache } from "@/db/queries/extraction-cache";
import { resolvePlatform, getScraperByPlatform, SUPPORTED_STORE_NAMES, type SupportedPlatform } from "./scrapers";
import { resolveProduct } from "./resolvers";
import { hasRequiredFields } from "./resolvers/merge";
import { hashUrl, isShortUrl, parseUrl, regionForUrl, resolveShortUrl, type Region } from "./url";
import type { ExtractionResult } from "./types";

export interface ExtractionResponse extends ExtractionResult {
  extraction_cache_id: string | null;
}

/**
 * Validate and canonicalize a pasted link BEFORE any paid work happens.
 * Throws 400 for anything we will never be able to extract.
 */
export interface PreparedUrl {
  canonicalUrl: string;
  urlHash: string;
  platform: SupportedPlatform;
  region: Region | null;
}

export async function prepareProductUrl(rawUrl: string): Promise<PreparedUrl> {
  if (!parseUrl(rawUrl)) throw new APIError(400, "That doesn't look like a valid product link.");

  let resolved = rawUrl.trim();
  if (isShortUrl(resolved)) {
    resolved = await resolveShortUrl(resolved);
    logger.info("extraction: resolved short URL", { from: rawUrl, to: resolved });
  }

  const platform = resolvePlatform(resolved);
  if (!platform) {
    throw new APIError(400, `We currently support ${SUPPORTED_STORE_NAMES.join(", ")}. Paste a product link from one of those stores.`);
  }

  const scraper = getScraperByPlatform(platform);
  if (!scraper.isProductUrl(resolved)) {
    throw new APIError(400, "Please paste a link to a specific product page, not a search, category or home page.");
  }

  const canonicalUrl = scraper.canonicalUrl(resolved);
  return { canonicalUrl, urlHash: hashUrl(canonicalUrl), platform, region: regionForUrl(canonicalUrl) };
}

/**
 * Coalesce concurrent extractions of the same product. Two customers (or one
 * customer double-clicking) pasting the same link share one run.
 */
const inflight = new Map<string, Promise<ExtractionResponse>>();

export async function extractProductData(url: string, userId: string): Promise<ExtractionResponse> {
  return extractPrepared(await prepareProductUrl(url), userId);
}

/** Same as extractProductData for a URL the caller has already prepared (avoids a second short-link resolution). */
export async function extractPrepared(prepared: PreparedUrl, userId: string): Promise<ExtractionResponse> {
  const cached = await getCachedExtractionByHash(prepared.urlHash);
  if (cached) {
    logger.info("extraction: cache hit", { url: prepared.canonicalUrl });
    return { ...cached.result, extraction_cache_id: cached.id, cached: true };
  }

  const existing = inflight.get(prepared.urlHash);
  if (existing) {
    logger.info("extraction: coalesced with in-flight request", { url: prepared.canonicalUrl });
    return existing;
  }

  const run = performExtraction(prepared, userId);
  inflight.set(prepared.urlHash, run);
  try {
    return await run;
  } finally {
    inflight.delete(prepared.urlHash);
  }
}

async function performExtraction(prepared: PreparedUrl, userId: string): Promise<ExtractionResponse> {
  const { canonicalUrl, urlHash, platform, region } = prepared;

  const outcome = await resolveProduct({ url: canonicalUrl, platform, region });
  const complete = hasRequiredFields(outcome.product);

  const messages = [...outcome.messages];
  if (!region) messages.push("This store region is not supported yet — our team will confirm shipping manually.");

  const result: ExtractionResult = {
    extraction_attempted: true,
    extraction_success: complete,
    platform,
    country: region,
    product: outcome.product,
    messages,
    errors: messages,
    source: outcome.primarySource,
    sources: outcome.ran,
    confidence: outcome.confidence,
    fetched_at: new Date().toISOString(),
  };

  logger.info("extraction: done", {
    url: canonicalUrl,
    platform,
    complete,
    source: outcome.primarySource,
    ran: outcome.ran,
    htmlSource: outcome.htmlSource,
    ms: outcome.durationMs,
  });

  const ttl = complete ? EXTRACTION.cacheTtlCompleteMs : EXTRACTION.cacheTtlPartialMs;
  const cacheId = await upsertExtractionCache({
    urlHash,
    productUrl: canonicalUrl,
    result,
    complete,
    source: outcome.primarySource,
    requestedBy: userId,
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  });

  return { ...result, extraction_cache_id: cacheId, cached: false };
}

/**
 * Load a stored extraction by id — valid or expired. Used by order creation
 * as the server-owned product snapshot. Never trust the client's copy.
 */
export async function getExtractionSnapshot(id: string): Promise<{ id: string; productUrl: string; result: ExtractionResult } | null> {
  return getExtractionById(id);
}
