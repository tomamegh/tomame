import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/** A sparse override row. NULL columns mean "keep the manifest value". */
export interface MediaOverrideRow {
  key: string;
  src: string | null;
  alt: string | null;
  position: string | null;
  width: number | null;
  height: number | null;
  /**
   * Object key in the private `marketing-media` bucket when an admin has
   * uploaded a replacement. Served through /api/media/[key] — never a URL, so
   * a row can never point a visitor's browser at a third party.
   */
  storage_path: string | null;
}

export type MediaOverrideMap = Record<string, MediaOverrideRow>;

/**
 * Every image override, keyed by image key.
 *
 * Never throws: an image that cannot be re-cropped is a cosmetic problem, and
 * failing the whole marketing page over it would be worse than showing the
 * built-in default. A read failure logs and yields an empty map.
 */
export async function getMediaOverrides(): Promise<MediaOverrideMap> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("media_overrides")
    .select("key, src, alt, position, width, height, storage_path");

  if (error) {
    logger.warn("media overrides unavailable, using manifest defaults", {
      error: error.message,
    });
    return {};
  }

  const map: MediaOverrideMap = {};
  for (const row of data ?? []) {
    map[row.key] = row as MediaOverrideRow;
  }
  return map;
}

// ── Writes (builder only) ───────────────────────────────────────────────────
// These use the service-role client: the builder authenticates the admin in the
// route handler, and the RLS admin policy depends on a cookie session that a
// multipart upload route does not necessarily carry.

export interface MediaOverrideWrite {
  key: string;
  src?: string | null;
  alt?: string | null;
  position?: string | null;
  width?: number | null;
  height?: number | null;
  storage_path?: string | null;
  content_type?: string | null;
  byte_size?: number | null;
  updated_by?: string | null;
}

/** Insert or merge an override row. Returns the stored row. */
export async function upsertMediaOverride(
  write: MediaOverrideWrite,
): Promise<MediaOverrideRow> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("media_overrides")
    .upsert({ ...write, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("key, src, alt, position, width, height, storage_path")
    .single();

  if (error) throw new Error(error.message);
  return data as MediaOverrideRow;
}

/** The single row for one key, or null. */
export async function getMediaOverride(
  key: string,
): Promise<(MediaOverrideRow & { content_type: string | null }) | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("media_overrides")
    .select("key, src, alt, position, width, height, storage_path, content_type")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as (MediaOverrideRow & { content_type: string | null }) | null) ?? null;
}

/** Drop an override entirely, restoring the manifest default. */
export async function deleteMediaOverride(key: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("media_overrides").delete().eq("key", key);
  if (error) throw new Error(error.message);
}
