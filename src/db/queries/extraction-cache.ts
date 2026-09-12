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
