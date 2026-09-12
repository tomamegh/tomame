import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * `extraction_requests` — which customer pasted which link (migration 041).
 *
 * Not the same question as `extraction_cache`. Migration 035 re-keyed the cache
 * to be PRODUCT-keyed (unique on `url_hash` alone) so many customers share one
 * extraction; its `user_id` is only "who requested it most recently" and is
 * overwritten by the next customer to paste the same URL. This table records the
 * (user, link) fact directly, one row per pair, and points at the shared
 * extraction for the priced result.
 */

export interface ExtractionRequestRow {
  id: string;
  url_hash: string;
  product_url: string;
  /** NULL once the cache row is pruned (FK is ON DELETE SET NULL). */
  extraction_cache_id: string | null;
  created_at: string;
  /** Bumped on every repeat paste — this is the column the Home card orders by. */
  updated_at: string;
}

const COLUMNS =
  "id, url_hash, product_url, extraction_cache_id, created_at, updated_at";

/**
 * Record that `userId` pasted `productUrl`. Upserts on (user_id, url_hash), so a
 * repeat paste moves the row to the top of the list instead of duplicating it.
 *
 * Service role on purpose: the caller is the extraction pipeline, which holds a
 * resolved user id rather than a request-bound client, and whose sibling write
 * (`upsertExtractionCache`) already runs this way. `user_id` is always the
 * server-resolved session user — never a client-supplied value.
 *
 * Never throws and never returns an error: a failed bookkeeping write must not
 * cost the customer their quote.
 */
export async function recordExtractionRequest(input: {
  userId: string;
  urlHash: string;
  productUrl: string;
  extractionCacheId: string | null;
}): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db.from("extraction_requests").upsert(
      {
        user_id: input.userId,
        url_hash: input.urlHash,
        product_url: input.productUrl,
        extraction_cache_id: input.extractionCacheId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,url_hash" },
    );

    if (error) {
      logger.warn("extraction request write failed", {
        code: error.code,
        message: error.message,
        hint: error.hint,
      });
    }
  } catch (err) {
    logger.warn("extraction request write exception", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * The newest link this customer pasted. Takes the caller's client so the
 * cookie-bound (RLS-enforced) client can be used — ownership is enforced by the
 * `extraction_requests owner read` policy, not by trusting this filter.
 *
 * Returns the request row only. The priced result lives in `extraction_cache`,
 * which has RLS enabled with no policies by design (shared, product-keyed data),
 * so it cannot be embedded here — the service reads it through
 * `db/queries/extraction-cache`.
 */
export async function getLatestExtractionRequest(
  client: SupabaseClient,
  userId: string,
): Promise<ExtractionRequestRow | null> {
  const { data, error } = await client
    .from("extraction_requests")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load extraction requests: ${error.message}`);
  }

  return (data as ExtractionRequestRow | null) ?? null;
}
