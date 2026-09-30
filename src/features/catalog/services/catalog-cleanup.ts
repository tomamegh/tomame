/**
 * The catalogue clean-up's rules, pure (084).
 *
 * Kelvin: "products that are scraped but cannot be priced are of no use". The
 * shop already hides every row without a landed price; this decides which of
 * those, and which other rows, are deleted outright. The database prefilter
 * (`catalog_cleanup_candidates`) mirrors these rules with the same thresholds
 * so a batch is not filled with rows that are only waiting; this function is
 * the one that decides, and the one the tests pin.
 *
 * A row somebody has in a bag, an order or a price watch is NEVER deleted,
 * whatever else is true of it (`referenced`, checked again at delete time).
 */
import type { CatalogStore } from "@/config/catalog";

export type CleanupReason =
  | "junk_title"
  | "junk_url"
  | "junk_image"
  | "duplicate"
  | "implausible"
  | "no_price"
  | "stale"
  | "unpriceable"
  | "weight_not_found";

export interface CleanupRow {
  store: CatalogStore;
  title: string | null;
  product_url: string;
  image_url: string | null;
  price_usd: number | null;
  landed_ghs: number | null;
  landed_priced_at: string | null;
  landed_decline: "no_price" | "needs_weight" | "unpriceable" | null;
  enrich_attempts: number;
  first_seen_at: string;
  last_seen_at: string;
  dup_rank: number;
  /** The enrichment already found no weight for this URL, before a re-scrape re-inserted it. */
  known_weight_miss: boolean;
}

export interface CleanupRules {
  now: Date;
  staleAfterDays: number;
  unpricedGraceHours: number;
  maxEnrichAttempts: number;
  /** Stores the weight enrichment can fetch on this deployment. */
  enrichableStores: readonly CatalogStore[];
  maxPlausiblePriceUsd: number;
  maxEbayTitleChars: number;
}

const HOUR = 3_600_000;

function isHttps(url: string | null | undefined): boolean {
  return typeof url === "string" && /^https:\/\//i.test(url.trim());
}

function olderThan(iso: string | null, hours: number, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now.getTime() - t > hours * HOUR;
}

/**
 * Why a row should be deleted, or null to keep it. First match wins, junk
 * first: a junk row is deleted whatever its price.
 *
 * Kept, deliberately:
 *   - a priced row seen recently;
 *   - a row not priced YET (`landed_priced_at` null): the refresh has not
 *     reached it, which says nothing about the product;
 *   - a declined row with no reason yet (priced before 084): the refresh
 *     strikes the reason on its next pass;
 *   - a weight-declined row the enrichment can still try, however old: the
 *     backlog is worked through, not deleted unread (it is hidden meanwhile).
 */
export function cleanupReasonFor(row: CleanupRow, rules: CleanupRules): CleanupReason | null {
  const { now } = rules;
  if (!row.title || row.title.trim() === "") return "junk_title";
  if (!isHttps(row.product_url)) return "junk_url";
  if (row.image_url != null && !isHttps(row.image_url)) return "junk_image";
  if (row.dup_rank > 1) return "duplicate";
  const price = row.price_usd == null ? null : Number(row.price_usd);
  if (price != null && price > rules.maxPlausiblePriceUsd) return "implausible";
  if (row.store === "ebay" && row.title.length > rules.maxEbayTitleChars) return "implausible";
  if (price == null || !(price > 0)) return "no_price";
  if (olderThan(row.last_seen_at, rules.staleAfterDays * 24, now)) return "stale";

  if (row.landed_ghs != null || row.landed_priced_at == null) return null;

  if (row.landed_decline === "unpriceable") {
    return olderThan(row.first_seen_at, rules.unpricedGraceHours, now) ? "unpriceable" : null;
  }
  if (row.landed_decline === "needs_weight") {
    if (row.enrich_attempts >= rules.maxEnrichAttempts) return "weight_not_found";
    // Nothing more the enrichment will do for it: an already-known miss, or a
    // store it cannot fetch. Treated like any other unpriceable row.
    const hopeless = row.known_weight_miss || !rules.enrichableStores.includes(row.store);
    return hopeless && olderThan(row.first_seen_at, rules.unpricedGraceHours, now) ? "weight_not_found" : null;
  }
  return null;
}
