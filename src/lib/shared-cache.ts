import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { logger } from "@/lib/logger";

/**
 * Reads every visitor shares, held in the Next data cache across instances.
 *
 * WHY (2026-10-16). A scraper walked every filter combination of the shop at
 * ~90 renders a minute. Each render made ~8 PostgREST calls for data that is
 * the same for every viewer — categories, facets, pricing inputs, banners, the
 * FX pill — and the smallest Supabase compute fell over after six hours of it.
 * A cached read turns that into one call per key per TTL.
 *
 * ONLY FOR DISPLAY OR SHARED READS. Nothing that decides what a customer is
 * charged goes through here: order intake, quote locks and checkout keep their
 * uncached reads.
 */

export const CACHE_TAGS = {
  /** Catalogue shape, facets, pages and shelves. Expired after the cron re-prices rows. */
  catalog: "catalog",
  /** Pricing constants, groups, fixed freight and rates, for display totals only. */
  pricingDisplay: "pricing:display",
  banners: "banners",
  mediaOverrides: "media-overrides",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/**
 * `unstable_cache` with one escape hatch: outside the Next server (vitest, a
 * `tsx` script) there is no incremental cache, so the read runs uncached.
 * Detected by `NEXT_RUNTIME`, which Next sets in every server runtime, rather
 * than by the wording of the invariant Next would throw. Errors are the read's
 * own and propagate — `unstable_cache` never stores a rejection.
 */
export function sharedCache<A extends unknown[], R>(
  read: (...args: A) => Promise<R>,
  keyParts: string[],
  options: { tags: CacheTag[]; revalidateSeconds: number },
): (...args: A) => Promise<R> {
  const cached = unstable_cache(read, keyParts, { tags: options.tags, revalidate: options.revalidateSeconds });
  return (...args: A) => (process.env.NEXT_RUNTIME ? cached(...args) : read(...args));
}

/**
 * Expire a tag now. Swallowed on failure: the write that prompted it already
 * happened, and the TTL bounds how long a missed expiry can last.
 */
export function expireCacheTag(tag: CacheTag): void {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (error) {
    logger.warn("shared-cache: could not expire tag", {
      tag,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
