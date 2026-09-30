import type { ExtractionResult } from "./types";
import { inferRegion } from "./url";

/**
 * Notes an extraction wrote BEFORE unregistered stores were priced from their
 * currency (2026-09-30). They are stored in `extraction_cache.result.messages`,
 * so cached Fashion Nova (and every other unregistered store) quotes kept
 * saying the store was unknown and unsupported after the fix. They are dropped
 * on the way out rather than rewritten in the table.
 */
const LEGACY_REGION_NOTES = new Set([
  "We don't know this store yet. Our team will confirm where it ships from before purchase.",
  "This store region is not supported yet. Our team will confirm shipping manually.",
]);

/** Give a region-less extraction the region its page implies, and drop the old notes. */
export function reviveRegion<T extends ExtractionResult>(extraction: T, url?: string | null): T {
  const country = extraction.country ?? inferRegion(url ?? null, extraction.product?.currency ?? null);
  const keep = (list: string[] | undefined) => (list ?? []).filter((m) => !LEGACY_REGION_NOTES.has(m));
  if (country === extraction.country && !extraction.messages?.some((m) => LEGACY_REGION_NOTES.has(m))) {
    return extraction;
  }
  const messages = keep(extraction.messages);
  if (!country) messages.push("We'll confirm which country this store ships from and price it for you before we buy.");
  return { ...extraction, country, messages, errors: messages };
}
