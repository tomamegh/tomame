import "server-only";

import { listMediaOverrides, type MediaOverrideMap } from "@/db/queries/media-overrides";
import { logger } from "@/lib/logger";
import { CACHE_TAGS, expireCacheTag, sharedCache } from "@/lib/shared-cache";

/**
 * The image overrides customer pages render with, shared across viewers. The
 * marketing pages and the shop's department tiles read the whole map on every
 * render; it changes only when an admin saves in the builder, which expires it.
 * The builder itself reads fresh.
 */
const readMediaOverrides = sharedCache(() => listMediaOverrides(), ["media-overrides"], {
  tags: [CACHE_TAGS.mediaOverrides],
  revalidateSeconds: 300,
});

/**
 * Never throws: a failed read is an empty map and every image keeps its
 * built-in default. The failure is caught OUTSIDE the cache, so it is not kept.
 */
export async function getSharedMediaOverrides(): Promise<MediaOverrideMap> {
  try {
    return await readMediaOverrides();
  } catch (error) {
    logger.warn("media overrides unavailable, using manifest defaults", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

/** After a builder write: customer pages show the new image on their next render. */
export function expireMediaOverrides(): void {
  expireCacheTag(CACHE_TAGS.mediaOverrides);
}
