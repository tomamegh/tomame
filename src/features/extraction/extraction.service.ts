import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { getCachedExtractionByHash, getExtractionById, upsertExtractionCache } from "@/db/queries/extraction-cache";
import { enqueueExtractionRequest, type RequestViewer } from "@/db/queries/extraction-requests";
import { getCategoryPricingMap } from "@/db/queries/pricing-groups";
import { getScraperForStore, SUPPORTED_STORE_NAMES } from "./scrapers";
import { storeForUrl, GENERIC_STORE_SLUG, type StoreDefinition } from "./stores";
import { resolveProduct, continueResolve, type ChainOutcome } from "./resolvers";
import { hasRequiredFields, hasWeight } from "./resolvers/merge";
import { hashUrl, isShortUrl, parseUrl, regionForUrl, resolveShortUrl, type Region } from "./url";
import type { ExtractionResult } from "./types";

export interface ExtractionResponse extends ExtractionResult {
  extraction_cache_id: string | null;
}

/**
 * A fresh extraction may come back before the slow tiers (Claude weight lookup)
 * have run. `enrich` finishes them and updates the cache row; the route
 * schedules it with `after()` so the customer is not kept waiting on it.
 */
export interface FreshExtraction extends ExtractionResponse {
  enrich?: () => Promise<void>;
}

/**
 * Validate and canonicalize a pasted link BEFORE any paid work happens.
 * Throws 400 for anything we will never be able to extract.
 */
export interface PreparedUrl {
  canonicalUrl: string;
  urlHash: string;
  /** Store slug — a registered store, or "generic" for any other public host. */
  platform: string;
  store: StoreDefinition;
  region: Region | null;
}

export async function prepareProductUrl(rawUrl: string): Promise<PreparedUrl> {
  if (!parseUrl(rawUrl)) throw new APIError(400, "That doesn't look like a valid product link.");

  let resolved = rawUrl.trim();
  if (isShortUrl(resolved)) {
    resolved = await resolveShortUrl(resolved);
    logger.info("extraction: resolved short URL", { from: rawUrl, to: resolved });
  }

  const store = storeForUrl(resolved);
  if (!store) {
    throw new APIError(400, `That link doesn't point at an online store we can read. We read ${SUPPORTED_STORE_NAMES.join(", ")} and most other stores.`);
  }

  const scraper = getScraperForStore(store);
  if (!scraper.isProductUrl(resolved)) {
    throw new APIError(400, "Please paste a link to a specific product page, not a search, category or home page.");
  }

  const canonicalUrl = scraper.canonicalUrl(resolved);
  return { canonicalUrl, urlHash: hashUrl(canonicalUrl), platform: store.slug, store, region: store.region ?? regionForUrl(canonicalUrl) };
}

/**
 * Coalesce concurrent extractions of the same product. Two customers (or one
 * customer double-clicking) pasting the same link share one run.
 */
const inflight = new Map<string, Promise<FreshExtraction>>();

export async function extractProductData(url: string, userId: string | null): Promise<FreshExtraction> {
  return extractPrepared(await prepareProductUrl(url), { userId, sessionId: null });
}

/**
 * Same as extractProductData for a URL the caller has already prepared (avoids a
 * second short-link resolution).
 *
 * Every quote — cached, coalesced or fresh — leaves through here, so this is
 * also where the paste is recorded against the customer. The recording is gated
 * on `userId`, which is a REQUIRED parameter of this function rather than an
 * optional one a call site could forget (see `applyImageOverride` in the Phase 1
 * post-mortem): the anonymous case is a real `null`, not an omission.
 */
export async function extractPrepared(prepared: PreparedUrl, viewer: RequestViewer): Promise<FreshExtraction> {
  const extraction = await resolveExtraction(prepared, viewer.userId);
  await notePaste(prepared, viewer, extraction.extraction_cache_id);
  return extraction;
}

/**
 * Record that this viewer pasted this link, so the Home "live receipt" and the
 * Buy-for-me list can find it later. `extraction_cache` cannot answer that
 * question: migration 035 made it product-keyed, so its `user_id` is overwritten
 * by the next customer to paste the same URL (see migration 041's header).
 *
 * Recorded for an anonymous viewer too, through the `tm_quote_session` cookie.
 * It used to be skipped — correctly, when only a signed-in customer had anywhere
 * to see it — but since 049 a session owns pastes, a bag and a queue, so a
 * signed-out paste has somewhere to appear.
 *
 * Writes through `enqueueExtractionRequest`, the SAME writer `/api/pastes` uses.
 * There were briefly two, and the second one upserted on `user_id,url_hash` — a
 * constraint 049 replaced with a unique index over the generated `owner_key`.
 * Every quote-flow paste therefore answered 42P10 and was swallowed by this
 * function's never-throw contract: the link vanished from the queue and the Home
 * receipt went stale, with nothing in the response to say so.
 */
async function notePaste(
  prepared: PreparedUrl,
  viewer: RequestViewer,
  extractionCacheId: string | null,
): Promise<void> {
  if (!viewer.userId && !viewer.sessionId) return;
  await enqueueExtractionRequest({
    viewer,
    urlHash: prepared.urlHash,
    productUrl: prepared.canonicalUrl,
    cachedId: extractionCacheId,
  });
}

async function resolveExtraction(prepared: PreparedUrl, userId: string | null): Promise<FreshExtraction> {
  const cached = await getCachedExtractionByHash(prepared.urlHash);
  if (cached) {
    logger.info("extraction: cache hit", { url: prepared.canonicalUrl });
    // The cache query fills legacy rows to the current product shape.
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

/**
 * Weight only changes the price for weight-based pricing groups. Skip the
 * background browser+LLM pass when the category is flat-rate (or unmapped —
 * those go to admin review regardless).
 */
async function weightMattersFor(category: string | null): Promise<boolean> {
  if (!category) return false;
  try {
    const group = (await getCategoryPricingMap()).get(category);
    return !!group && (group.flat_rate_expression != null || group.requires_weight);
  } catch (err) {
    logger.warn("extraction: could not load pricing groups for enrichment gate", { error: err instanceof Error ? err.message : String(err) });
    return true;
  }
}

function toResult(prepared: PreparedUrl, outcome: ChainOutcome, sourcesRan: ChainOutcome["ran"]): ExtractionResult {
  const complete = hasRequiredFields(outcome.product);
  const messages = [...outcome.messages];
  if (prepared.platform === GENERIC_STORE_SLUG) messages.push("We don't know this store yet. Our team will confirm where it ships from before purchase.");
  else if (!prepared.region) messages.push("This store region is not supported yet. Our team will confirm shipping manually.");
  if (prepared.store.status === "blocked" && !complete) messages.push(`${prepared.store.name} blocks automated reading right now. Enter the price and our team will verify it.`);
  return {
    extraction_attempted: true,
    extraction_success: complete,
    platform: prepared.platform,
    country: prepared.region,
    product: outcome.product,
    messages,
    errors: messages,
    source: outcome.primarySource,
    sources: sourcesRan,
    confidence: outcome.confidence,
    fetched_at: new Date().toISOString(),
  };
}

async function performExtraction(prepared: PreparedUrl, userId: string | null): Promise<FreshExtraction> {
  const { canonicalUrl, urlHash, platform, region, store } = prepared;
  const chainInput = { url: canonicalUrl, platform, region, store };

  // Fast mode: answer as soon as title + price + currency are known. Weight
  // (and anything else the paid tiers add) is filled in by `enrich` below.
  const outcome = await resolveProduct({ ...chainInput, stopWhenRequired: true });
  const result = toResult(prepared, outcome, outcome.ran);
  const complete = result.extraction_success;

  logger.info("extraction: done", {
    url: canonicalUrl,
    platform,
    complete,
    source: outcome.primarySource,
    ran: outcome.ran,
    skipped: outcome.skipped,
    htmlSource: outcome.htmlSource,
    ms: outcome.durationMs,
    timings: outcome.timings,
  });

  const ttl = complete ? EXTRACTION.cacheTtlCompleteMs : EXTRACTION.cacheTtlPartialMs;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const cacheId = await upsertExtractionCache({
    urlHash,
    productUrl: canonicalUrl,
    result,
    complete,
    source: outcome.primarySource,
    requestedBy: userId,
    expiresAt,
  });

  const enrich =
    complete && outcome.skipped.length > 0 && !hasWeight(outcome.product) && (await weightMattersFor(outcome.product.category))
      ? async () => {
          const t0 = Date.now();
          const enriched = await continueResolve(chainInput, outcome);
          const gained = (Object.keys(enriched.fieldSources) as (keyof typeof enriched.fieldSources)[])
            .filter((k) => enriched.fieldSources[k] !== outcome.fieldSources[k]);
          logger.info("extraction: enrichment done", { url: canonicalUrl, ran: enriched.ran, gained, ms: Date.now() - t0 });
          const updated = toResult(prepared, enriched, [...outcome.ran, ...enriched.ran]);
          await upsertExtractionCache({
            urlHash,
            productUrl: canonicalUrl,
            result: updated,
            complete: true,
            source: enriched.primarySource,
            requestedBy: userId,
            expiresAt,
          });
        }
      : undefined;

  return { ...result, extraction_cache_id: cacheId, cached: false, enrich };
}

/**
 * Load a stored extraction by id — valid or expired. Used by order creation
 * as the server-owned product snapshot. Never trust the client's copy.
 */
export async function getExtractionSnapshot(id: string): Promise<{ id: string; productUrl: string; result: ExtractionResult } | null> {
  return getExtractionById(id);
}
