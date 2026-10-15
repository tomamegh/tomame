import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { getCachedExtractionByHash, getExtractionById, updateExtractionResultIfInspection, upsertExtractionCache } from "@/db/queries/extraction-cache";
import { enqueueExtractionRequest, type RequestViewer } from "@/db/queries/extraction-requests";
import { getCategoryPricingMap } from "@/db/queries/pricing-groups";
import { getScraperForStore, SUPPORTED_STORE_NAMES } from "./scrapers";
import { reviveRegion } from "./region-revive";
import { storeForUrl, type StoreDefinition } from "./stores";
import { resolveProduct, continueResolve, type ChainOutcome } from "./resolvers";
import { hasRequiredFields, hasWeight } from "./resolvers/merge";
import { classifyCategory } from "./category.service";
import { inspectFreight, planFreightInspection } from "@/features/pricing/services/freight-inspector.service";
import { freightCheckDue } from "@/features/pricing/freight-inspection";
import { hashUrl, inferRegion, isShortUrl, parseUrl, regionForUrl, resolveShortUrl, usEbayItemUrl, type Region } from "./url";
import type { ExtractionResult } from "./types";

export interface ExtractionResponse extends ExtractionResult {
  extraction_cache_id: string | null;
}

/**
 * A fresh extraction may come back before the slow tiers (Claude weight lookup)
 * and the freight check have run. `enrich` finishes both and updates the cache
 * row; the route schedules it with `after()` so the customer is not kept
 * waiting on it. `checkFreight` is the freight check alone, for callers that
 * never ran the slow tiers (the paste queue). Either is absent when there is
 * nothing to do.
 */
export interface FreshExtraction extends ExtractionResponse {
  enrich?: () => Promise<void>;
  checkFreight?: () => Promise<void>;
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
  resolved = usEbayItemUrl(resolved);

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
    const revived = reviveRegion(cached.result, prepared.canonicalUrl);
    const recheck = await startFreightRecheck(cached.id, revived, prepared.canonicalUrl);
    return { ...(recheck?.result ?? revived), extraction_cache_id: cached.id, cached: true, enrich: recheck?.run, checkFreight: recheck?.run };
  }

  const existing = inflight.get(prepared.urlHash);
  if (existing) {
    logger.info("extraction: coalesced with in-flight request", { url: prepared.canonicalUrl });
    // The first caller schedules the background work; a second would run it twice.
    const { enrich: _enrich, checkFreight: _check, ...shared } = await existing;
    return shared;
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

export const STORE_SHIPPING_UNKNOWN_MESSAGE = "Store shipping couldn't be confirmed for this listing; it may be added at review.";

function toResult(prepared: PreparedUrl, outcome: ChainOutcome, sourcesRan: ChainOutcome["ran"]): ExtractionResult {
  const complete = hasRequiredFields(outcome.product);
  const messages = [...outcome.messages];
  // A store outside the registry is priced from what its page says (currency)
  // and its address, instead of being refused. Only when neither says where it
  // ships from does the customer see a note, and it is a promise, not a refusal.
  const region = prepared.region ?? inferRegion(prepared.canonicalUrl, outcome.product.currency);
  if (!region) messages.push("We'll confirm which country this store ships from and price it for you before we buy.");
  // eBay sellers set their own shipping to our warehouse; priced as 0 when we
  // could not read it, so the customer is told it may still be added.
  // eBay and Etsy sellers set their own shipping to our hub; priced as 0 when
  // we could not read it, so the customer is told it may be added at review.
  if ((prepared.platform === "ebay" || prepared.platform === "etsy") && complete && outcome.product.store_shipping == null) messages.push(STORE_SHIPPING_UNKNOWN_MESSAGE);
  if (prepared.store.status === "blocked" && !complete) messages.push(`${prepared.store.name} blocks automated reading right now. Enter the price and our team will verify it.`);
  return {
    extraction_attempted: true,
    extraction_success: complete,
    platform: prepared.platform,
    country: region,
    product: outcome.product,
    messages,
    errors: messages,
    source: outcome.primarySource,
    sources: sourcesRan,
    confidence: outcome.confidence,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Decide the freight check for a result, without a model call: a `pending`
 * marker when the background check must run, a finished inspection when none
 * is needed. The quote is priced and cached with it straight away. Never throws.
 */
async function withFreightPlan(result: ExtractionResult, url: string): Promise<ExtractionResult> {
  const plan = await planFreightInspection(result, { url });
  return plan ? { ...result, freight_inspection: plan } : result;
}

/**
 * Run a planned check to its verdict. A result that is not pending comes back
 * unchanged; one whose check produced nothing loses its marker, so no row is
 * ever left pending by a finished run. Never throws.
 */
async function runFreightCheck(result: ExtractionResult, url: string): Promise<ExtractionResult> {
  if (result.freight_inspection?.status !== "pending") return result;
  try {
    const inspection = await inspectFreight(result, { url });
    if (inspection) return { ...result, freight_inspection: inspection };
  } catch (err) {
    logger.warn("extraction: freight inspection threw", { url, error: err instanceof Error ? err.message : String(err) });
  }
  const rest = { ...result };
  delete rest.freight_inspection;
  return rest;
}

/** True when enrichment left every fact the inspector looked at unchanged. */
function sameFreightFacts(a: ExtractionResult["product"], b: ExtractionResult["product"]): boolean {
  return a.title === b.title && a.category === b.category && a.weight_lbs === b.weight_lbs && a.price === b.price && a.currency === b.currency;
}

/** Cache rows whose freight check is running in this instance, so two reads do not start it twice. */
const rechecking = new Set<string>();

/**
 * A cached product whose freight check never finished — the model timed out
 * or errored, or the background run was lost and its `pending` went stale —
 * gets a fresh check. The new `pending` marker is written first, guarded on
 * the old inspection, so only one reader wins the claim; the winner gets the
 * pending result to show and `run` to schedule after its response.
 */
export async function startFreightRecheck(
  id: string,
  result: ExtractionResult,
  url: string,
): Promise<{ result: ExtractionResult; run: () => Promise<void> } | null> {
  if (!freightCheckDue(result.freight_inspection) || rechecking.has(id)) return null;
  const plan = await planFreightInspection(result, { url });
  if (plan?.status !== "pending") return null;
  const pending: ExtractionResult = { ...result, freight_inspection: plan };
  if (!(await updateExtractionResultIfInspection(id, pending, result.freight_inspection?.inspected_at ?? null))) return null;
  logger.info("extraction: freight re-check started", { url, previous: result.freight_inspection?.status });
  rechecking.add(id);
  return {
    result: pending,
    run: async () => {
      try {
        const checked = await runFreightCheck(pending, url);
        await updateExtractionResultIfInspection(id, checked, plan.inspected_at);
      } finally {
        rechecking.delete(id);
      }
    },
  };
}

/**
 * A slow page read can spend the whole chain budget before the category tier
 * gets its turn (Nike via Zyte, 2026-10-08), and with no category freight is
 * `needs_review`. The classifier is ~1 s and has its own timeout, so run it once
 * past the deadline rather than send a product with a price to admin review.
 */
async function withLateCategory(outcome: ChainOutcome, store: string): Promise<ChainOutcome> {
  const p = outcome.product;
  if (p.category != null || !p.title || !hasRequiredFields(p)) return outcome;
  const crumbs = Array.isArray(p.metadata?.breadcrumbs) ? p.metadata.breadcrumbs.filter((c): c is string => typeof c === "string") : [];
  try {
    const result = await classifyCategory(
      {
        store,
        title: p.title,
        brand: p.brand,
        breadcrumbs: crumbs,
        categoryText: typeof p.metadata?.categoryText === "string" ? p.metadata.categoryText : null,
      },
      AbortSignal.timeout(EXTRACTION.classifierTimeoutMs),
    );
    if (!result) return outcome;
    logger.info("extraction: category classified after the chain", { store, category: result.category, source: result.source });
    return {
      ...outcome,
      product: { ...p, category: result.category },
      confidence: { ...outcome.confidence, category: result.source === "llm" ? Math.min(0.8, Math.max(0.5, result.confidence)) : 0.85 },
      fieldSources: { ...outcome.fieldSources, category: "category-map" },
      ran: outcome.ran.includes("category-map") ? outcome.ran : [...outcome.ran, "category-map"],
    };
  } catch (err) {
    logger.warn("extraction: late category failed", { store, error: err instanceof Error ? err.message : String(err) });
    return outcome;
  }
}

async function performExtraction(prepared: PreparedUrl, userId: string | null): Promise<FreshExtraction> {
  const { canonicalUrl, urlHash, platform, region, store } = prepared;
  const chainInput = { url: canonicalUrl, platform, region, store };

  // Fast mode: answer as soon as title + price + currency are known. Weight
  // (and anything else the paid tiers add) is filled in by `enrich` below.
  const outcome = await withLateCategory(await resolveProduct({ ...chainInput, stopWhenRequired: true }), platform);
  // The freight check is planned before the first cache write (so the review
  // page never renders an unchecked weight as final) but runs after the
  // response: the quote shows at once and says the freight is being checked.
  const result = await withFreightPlan(toResult(prepared, outcome, outcome.ran), canonicalUrl);
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
    freightCheck: result.freight_inspection?.status ?? null,
  });

  const ttl = complete ? EXTRACTION.cacheTtlCompleteMs : EXTRACTION.cacheTtlPartialMs;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const write = (r: ExtractionResult, source: ChainOutcome["primarySource"], isComplete: boolean) =>
    upsertExtractionCache({ urlHash, productUrl: canonicalUrl, result: r, complete: isComplete, source, requestedBy: userId, expiresAt });
  const cacheId = await write(result, outcome.primarySource, complete);

  const needsEnrichment = complete && outcome.skipped.length > 0 && !hasWeight(outcome.product) && (await weightMattersFor(outcome.product.category));
  const checking = result.freight_inspection?.status === "pending";

  const checkFreight = checking
    ? async () => {
        await write(await runFreightCheck(result, canonicalUrl), outcome.primarySource, complete);
      }
    : undefined;

  const enrich =
    needsEnrichment
      ? async () => {
          const t0 = Date.now();
          // Started together: the freight check does not wait on the slow tiers,
          // so the customer can pay as soon as it answers.
          const enrichment = continueResolve(chainInput, outcome).then(
            (enriched) => enriched,
            (err: unknown) => {
              logger.warn("extraction: enrichment failed", { url: canonicalUrl, error: err instanceof Error ? err.message : String(err) });
              return null;
            },
          );
          let current = result;
          if (checking) {
            current = await runFreightCheck(result, canonicalUrl);
            await write(current, outcome.primarySource, complete);
          }
          const enriched = await enrichment;
          if (!enriched) return;
          const gained = (Object.keys(enriched.fieldSources) as (keyof typeof enriched.fieldSources)[])
            .filter((k) => enriched.fieldSources[k] !== outcome.fieldSources[k]);
          logger.info("extraction: enrichment done", { url: canonicalUrl, ran: enriched.ran, gained, ms: Date.now() - t0 });
          let updated = toResult(prepared, enriched, [...outcome.ran, ...enriched.ran]);
          if (sameFreightFacts(outcome.product, updated.product)) {
            updated = current.freight_inspection ? { ...updated, freight_inspection: current.freight_inspection } : updated;
          } else {
            // A weight (or category) arrived: the earlier verdict was about other facts.
            updated = await withFreightPlan(updated, canonicalUrl);
            if (updated.freight_inspection?.status === "pending") {
              await write(updated, enriched.primarySource, true);
              updated = await runFreightCheck(updated, canonicalUrl);
            }
          }
          await write(updated, enriched.primarySource, true);
        }
      : checkFreight;

  return { ...result, extraction_cache_id: cacheId, cached: false, enrich, checkFreight };
}

/**
 * Load a stored extraction by id — valid or expired. Used by order creation
 * as the server-owned product snapshot. Never trust the client's copy.
 */
export async function getExtractionSnapshot(id: string): Promise<{ id: string; productUrl: string; result: ExtractionResult } | null> {
  return getExtractionById(id);
}
