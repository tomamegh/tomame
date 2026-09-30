/**
 * Catalogue pre-scraper (migrations 045, 084, src/features/catalog).
 *
 * ScraperAPI is now a paid plan (100,000 credits a month, 2026-09-29), shared
 * by BOTH deployments and by the live paste flow. Every structured e-commerce
 * request (Amazon, eBay, Walmart, search or product) costs 5 credits; Zyte
 * (Etsy, Nike) and Oxylabs bill separately per request. So every job here is
 * budget-capped per month in `job_budgets`, and the cap depends on which
 * deployment is running: production gets a real allowance, every other
 * deployment a token one, because dev spends the same keys (the 2026-09-28
 * exhaustion was dev and prod both scraping hourly against one key).
 */

/** Every store the catalogue can hold. `catalog_*.store` CHECKs mirror this (084). */
export const CATALOG_STORES = ["amazon", "ebay", "walmart", "etsy", "nike"] as const;
export type CatalogStore = (typeof CATALOG_STORES)[number];

/** Stores the shop always lists in its filter; the others appear once they hold rows. */
export const CATALOG_CORE_STORES: readonly CatalogStore[] = ["amazon", "ebay"];

export type CatalogSearchVendor = "scraperapi" | "zyte";

/**
 * How each store's search page is read, and whether the scraper uses it.
 *
 * Every store listed here orders through the ordinary paste flow: a shop card
 * hands its URL to `/app/orders/new?url=`, which reads it through the
 * extraction registry (`src/features/extraction/stores.ts`, all five are
 * `live` there). A store may only be added here once that is true.
 *
 * `enabled` is the per-store switch. Queries of a disabled store stay in
 * `catalog_queries` untouched and are simply never claimed.
 */
export const CATALOG_STORE_SEARCH: Record<CatalogStore, { vendor: CatalogSearchVendor; enabled: boolean }> = {
  amazon: { vendor: "scraperapi", enabled: true },
  ebay: { vendor: "scraperapi", enabled: true },
  walmart: { vendor: "scraperapi", enabled: true },
  // Zyte AI `productList` on the store's own search page. Etsy measured 22 s,
  // Nike 3 s (2026-09-30).
  etsy: { vendor: "zyte", enabled: true },
  nike: { vendor: "zyte", enabled: true },
};

export function isCatalogStore(value: string | null | undefined): value is CatalogStore {
  return (CATALOG_STORES as readonly string[]).includes(value ?? "");
}

// ── Which deployment is this ─────────────────────────────────────────────────

const PRODUCTION_HOSTS = new Set(["tomame.ca", "www.tomame.ca"]);

/**
 * Production is tomame.ca and nothing else. Keyed off the public app URL, the
 * same test the operations alerts use, so dev (dev.tomame.ca), previews and
 * local all fall to the small caps without any code or env difference.
 */
export function isProductionDeployment(appUrl: string | null | undefined = process.env.NEXT_PUBLIC_APP_URL): boolean {
  if (!appUrl) return false;
  try {
    return PRODUCTION_HOSTS.has(new URL(appUrl).host.toLowerCase());
  } catch {
    return false;
  }
}

export interface MonthlyCaps {
  /** Vendor calls a month on tomame.ca. */
  production: number;
  /** Everywhere else. Dev shares the vendor keys, so this stays small. */
  other: number;
}

/**
 * The cap a job runs under this month.
 *
 * A NEW period row is created with the deployment's cap. An existing row's cap
 * is the owner's to edit (raise it on prod with one UPDATE), except that off
 * production it is clamped down to the small cap: a dev database carrying an
 * old 500 must not be able to spend a paid key's credits.
 */
export function effectiveMonthlyCap(caps: MonthlyCaps, rowCap: number | null, production: boolean): number {
  if (production) return rowCap ?? caps.production;
  return Math.min(rowCap ?? caps.other, caps.other);
}

export const CATALOG_JOB = {
  /** Budget key in `job_budgets`. */
  jobName: "catalog-scrape",
  /**
   * Search calls per calendar month (UTC) before the job skips runs. 3,000
   * ScraperAPI searches are 15,000 credits; pg_cron fires every 15 minutes
   * (about 2,900 runs a month, migration 084), so the cap and the schedule agree.
   */
  monthlyCaps: { production: 3000, other: 40 } satisfies MonthlyCaps,
  /** Deactivate a query after this many consecutive failed vendor calls. */
  maxConsecutiveFailures: 5,
  /** A query is not re-run sooner than this after a claim. */
  requeryAfterHours: 24,
  /** eBay search measured at 25 s live, Etsy through Zyte 22 s; the route's maxDuration is 60 s. */
  vendorTimeoutMs: 45_000,
  /** Keep the `raw` jsonb per product small — the fields we did not map. */
  maxRawBytes: 4_000,
} as const;

export const CATALOG_SEARCH = {
  minQueryLength: 2,
  maxQueryLength: 120,
  defaultLimit: 12,
  /**
   * The browse and search screens' first page, and the step "show more" adds.
   * Four rows of the six-up grid at desktop width.
   */
  pageSize: 24,
  /**
   * The ceiling on one rendered page. Every card's landed total is struck live
   * by the pricing engine when the page renders, so this is a render-cost cap,
   * not a database one: 120 is what `search_catalog_products` will return (062)
   * and what that pricing loop absorbs comfortably.
   *
   * It was 24, which was also the page size — the catalogue passed 700 products
   * while every shelf still stopped at its first two dozen, with nothing to
   * press for the rest.
   */
  maxLimit: 120,
} as const;

/**
 * Sanity bounds on a single vendor search row, applied in the mapper so that
 * search, browse and the home shelf are all covered by one guard.
 *
 * ScraperAPI's eBay search endpoint occasionally collapses a whole results
 * block into one row: `product_title` is a dozen listings' titles run
 * together and `item_price.value` is their prices concatenated into one
 * 39-digit number. Mapped straight through, one reached the catalogue as a
 * "GH₵1,995,202,244,743,568,400,000,… delivered to your door" deal wearing
 * the "Cheapest on eBay" badge.
 */
export const CATALOG_ROW_SANITY = {
  /**
   * eBay caps a listing title at 80 characters, so a longer one is not a long
   * title — it is several listings. Measured against the live catalogue:
   * every sound eBay row is ≤ 80, every concatenated one is > 80. Amazon
   * titles are legitimately several hundred characters, so this is eBay-only.
   */
  maxEbayTitleChars: 80,
  /**
   * Neither tell subsumes the other: a concatenated row can carry no price at
   * all, and three short titles concatenate to only 85 characters.
   */
  maxPlausiblePriceUsd: 100_000,
} as const;

/**
 * The signed-in Home screen's "Hot right now" shelf.
 */
export const CATALOG_DEALS = {
  /**
   * The highest listed price the shelf will vouch for, in USD.
   *
   * A SANITY BOUND AGAINST MALFORMED VENDOR ROWS, not a business rule about
   * what Tomame will buy — nothing is refused anywhere else because of this
   * number, and a customer who pastes the link to a $200,000 listing still
   * gets it read and priced.
   *
   * The shelf is the one catalogue screen nobody asked for a specific row on,
   * so it is the one screen that may decline a row it cannot vouch for — the
   * same reasoning that drops unpriceable rows here and keeps them in search.
   *
   * `mapEbaySearchResults` now rejects these rows on the way in and the ones
   * already stored have been deleted, so this is the belt to that fix's
   * braces: it still covers a row from before the fix in an environment
   * nobody cleaned, an admin-inserted row, and the Amazon side, which the
   * 80-character title tell deliberately leaves alone. One number, defined
   * once above.
   */
  maxPlausiblePriceUsd: CATALOG_ROW_SANITY.maxPlausiblePriceUsd,
} as const;

/**
 * Weight enrichment (084): a search row carries no weight, so a product in a
 * weight-priced group is declined by the calculator (`needs_review`). One
 * product-details call per run finds the weight and the row is re-priced.
 */
export const CATALOG_ENRICH = {
  jobName: "catalog-enrich",
  /**
   * Product calls a month. pg_cron fires every 10 minutes (about 4,300 runs);
   * 4,000 calls is at most 20,000 ScraperAPI credits when every one is Amazon
   * or eBay, fewer when Walmart goes to Oxylabs and Etsy/Nike to Zyte.
   */
  monthlyCaps: { production: 4000, other: 40 } satisfies MonthlyCaps,
  /** A product with no weight anywhere is fetched at most this many times. */
  maxAttempts: 2,
  /** A failed or weightless attempt waits this long before the second one. */
  retryAfterHours: 6,
} as const;

/**
 * The daily clean-up (084). Rows it removes are useless to the shop: a
 * customer can neither see nor buy what we cannot price.
 */
export const CATALOG_CLEANUP = {
  /** Not re-read by the scraper for this long: a stale listing. */
  staleAfterDays: 30,
  /**
   * An unpriceable row the enrichment cannot help (no pricing group, a store
   * with no enrichment vendor, a product already known to have no weight) is
   * kept this long after first seen. A weight-declined row the enrichment can
   * still try is kept until its attempts are spent, however old: the backlog
   * is worked through, not deleted unread.
   */
  unpricedGraceHours: 48,
  /** Candidate rows read per run. The run fires four times in its hour. */
  batchSize: 500,
} as const;
