import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { withProductDefaults, type ExtractionResult } from "@/features/extraction/types";
import type { ExtractionSource } from "@/config/extraction";

/**
 * Rows written before the typed facts (seller, rating, images, …) existed are
 * filled to the current `ScrapedProduct` shape here, at the one place every
 * reader goes through, so no consumer branches on a row's age.
 */
function normalizeResult(raw: unknown): ExtractionResult {
  const result = raw as ExtractionResult;
  return { ...result, product: withProductDefaults(result.product) };
}

export interface ExtractionCacheRow {
  id: string;
  url_hash: string;
  product_url: string;
  result: ExtractionResult;
  is_valid: boolean;
  expires_at: string;
}

/** Valid, unexpired entry for a canonical URL hash. Product-keyed: shared across users. */
export async function getCachedExtractionByHash(urlHash: string): Promise<{ id: string; result: ExtractionResult } | null> {
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
    return { id: data.id as string, result: normalizeResult(data.result) };
  } catch (err) {
    logger.warn("extraction cache read failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Entry by id regardless of validity — the order snapshot must outlive the cache TTL. */
export async function getExtractionById(id: string): Promise<{ id: string; productUrl: string; result: ExtractionResult } | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("extraction_cache")
      .select("id, product_url, result")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id as string, productUrl: data.product_url as string, result: normalizeResult(data.result) };
  } catch (err) {
    logger.warn("extraction cache read by id failed", { id, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function getValidExtractionById(id: string): Promise<ExtractionCacheRow | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("extraction_cache")
      .select("id, url_hash, product_url, result, is_valid, expires_at")
      .eq("id", id)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return { ...(data as ExtractionCacheRow), result: normalizeResult(data.result) };
  } catch {
    return null;
  }
}

export async function upsertExtractionCache(input: {
  urlHash: string;
  productUrl: string;
  result: ExtractionResult;
  complete: boolean;
  source: ExtractionSource | null;
  requestedBy: string | null;
  expiresAt: string;
}): Promise<string | null> {
  try {
    const db = createAdminClient();

    // NEVER downgrade a product we already read successfully.
    //
    // The upsert is keyed on `url_hash`, so a re-read of a link whose store was
    // blocked THAT MINUTE would replace a complete product — title, price, weight
    // — with an empty one. That is money: `cart_items` and `orders` both price
    // from this row, so a bag line that had a price silently loses it, and the
    // customer sees "Price could not be read" on something they were about to pay
    // for. Observed on a real bag line while building the paste queue (049),
    // which re-extracts far more eagerly than the old synchronous path did.
    //
    // A price CAN legitimately vanish (a delisted product), so this is not "never
    // overwrite": a complete result always wins, and an incomplete one is only
    // refused while a complete, unexpired row still stands.
    if (!input.complete) {
      const { data: existing } = await db
        .from("extraction_cache")
        .select("id")
        .eq("url_hash", input.urlHash)
        .eq("is_valid", true)
        .eq("complete", true)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (existing) {
        logger.info("extraction cache: keeping the complete row over an incomplete re-read", {
          url: input.productUrl,
        });
        return existing.id as string;
      }
    }

    const { data, error } = await db
      .from("extraction_cache")
      .upsert(
        {
          url_hash: input.urlHash,
          product_url: input.productUrl,
          result: input.result,
          is_valid: true,
          complete: input.complete,
          source: input.source,
          user_id: input.requestedBy,
          expires_at: input.expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "url_hash" },
      )
      .select("id")
      .single();

    if (error || !data) {
      logger.warn("extraction cache write failed", { code: error?.code, message: error?.message, hint: error?.hint });
      return null;
    }
    return data.id as string;
  } catch (err) {
    logger.warn("extraction cache write exception", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** What a paste can honestly promise about the quote behind it. */
export interface QuoteFacts {
  /** The extraction still resolves — exactly `getValidExtractionById`'s rule. */
  usable: boolean;
  /** It carries a price. A readable page with no price is not a quote. */
  priced: boolean;
}

/**
 * The state of several extractions at once, by the SAME rule the review screen
 * applies before it renders.
 *
 * The paste queue used to call a link "Priced and ready" whenever its job had
 * finished and written a cache row. That is three different claims collapsed into
 * one: the job finished, the row is still valid and unexpired, and the product
 * actually has a price. A row can be any combination — so customers were offered
 * "See the landed price" on links that answered "This quote is no longer
 * available", and on links that were read but never priced.
 *
 * Reading the validity rule from here rather than restating it is the point: the
 * badge and the destination cannot disagree, because they ask the same question.
 */
export async function getQuoteFacts(ids: readonly string[]): Promise<Map<string, QuoteFacts>> {
  const facts = new Map<string, QuoteFacts>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return facts;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("extraction_cache")
      .select("id, is_valid, expires_at, result")
      .in("id", wanted);

    if (error || !data) return facts;

    const now = Date.now();
    for (const row of data as { id: string; is_valid: boolean; expires_at: string; result: unknown }[]) {
      const usable = row.is_valid === true && new Date(row.expires_at).getTime() > now;
      const price = normalizeResult(row.result).product?.price;
      facts.set(row.id, {
        usable,
        priced: usable && typeof price === "number" && Number.isFinite(price) && price > 0,
      });
    }
  } catch {
    // A read failure must not turn every paste into a false promise; callers
    // treat a missing entry as "not usable", which is the safe direction.
  }
  return facts;
}
