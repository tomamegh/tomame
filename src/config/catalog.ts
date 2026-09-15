/**
 * Catalogue pre-scraper (migration 045, src/features/catalog).
 *
 * The vendor is ScraperAPI's free tier — roughly 1000 requests a month shared
 * with the live paste flow — so the job is budget-capped rather than
 * schedule-capped: pg_cron fires it hourly, but the monthly cap is what
 * decides how many of those ticks actually spend a credit.
 */
export const CATALOG_JOB = {
  /** Budget key in `job_budgets`. */
  jobName: "catalog-scrape",
  /** Vendor calls per calendar month (UTC) before the job starts skipping runs. */
  defaultMonthlyCap: 500,
  /** Deactivate a query after this many consecutive failed vendor calls. */
  maxConsecutiveFailures: 5,
  /** A query is not re-run sooner than this after a claim. */
  requeryAfterHours: 24,
  /** eBay search measured at 25 s live; the route's maxDuration is 60 s. */
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
 * The signed-in Home screen's "Hot right now" shelf.
 */
export const CATALOG_DEALS = {
  /**
   * The highest listed price the shelf will vouch for, in USD.
   *
   * A SANITY BOUND AGAINST MALFORMED VENDOR ROWS, not a business rule about
   * what Tomame will buy — nothing is refused anywhere else because of this
   * number, and a customer who pastes the link to a $200,000 listing still
   * gets it read and priced. It exists because ScraperAPI's eBay endpoint
   * occasionally returns one row that is eight listings run together, with
   * their prices concatenated into a single 39-digit number; one of those
   * reached this shelf reading "GH₵1,995,202,244,743,568,400,000,…".
   *
   * The shelf is the one catalogue screen nobody asked for a specific row on,
   * so it is the one screen that may decline a row it cannot vouch for — the
   * same reasoning that drops unpriceable rows here and keeps them in search.
   * The real fix is in `mapEbaySearchResults`, and the rows already stored
   * need cleaning; both are their own piece of work.
   */
  maxPlausiblePriceUsd: 100_000,
} as const;
