import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * `store_category_map` — learned (store, breadcrumb path) → Tomame category
 * (migration 043). Read on every quote, written on a classifier miss. Both
 * paths swallow errors: a category is a pricing hint, never worth failing a
 * quote over.
 */
export interface StoreCategoryRow {
  store: string;
  source_path: string;
  tomame_category: string;
  source: "seed" | "llm" | "admin";
  confidence: number | null;
}

export async function getStoreCategory(store: string, sourcePath: string): Promise<StoreCategoryRow | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("store_category_map")
      .select("store, source_path, tomame_category, source, confidence")
      .eq("store", store)
      .eq("source_path", sourcePath)
      .maybeSingle();
    if (error || !data) return null;
    return data as StoreCategoryRow;
  } catch (err) {
    logger.warn("store_category_map read failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Insert a learned mapping. Never overwrites an admin correction. */
export async function upsertStoreCategory(input: {
  store: string;
  sourcePath: string;
  tomameCategory: string;
  source: "seed" | "llm";
  confidence: number | null;
  sampleTitle: string | null;
}): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("store_category_map")
      .select("source")
      .eq("store", input.store)
      .eq("source_path", input.sourcePath)
      .maybeSingle();
    if (existing?.source === "admin") return;
    const { error } = await db.from("store_category_map").upsert(
      {
        store: input.store,
        source_path: input.sourcePath,
        tomame_category: input.tomameCategory,
        source: input.source,
        confidence: input.confidence,
        sample_title: input.sampleTitle,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store,source_path" },
    );
    if (error) logger.warn("store_category_map write failed", { code: error.code, message: error.message });
  } catch (err) {
    logger.warn("store_category_map write exception", { error: err instanceof Error ? err.message : String(err) });
  }
}
