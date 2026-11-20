import type { MonthlyCaps } from "@/config/catalog";

/**
 * The AI price finder (migration 105, src/features/finder).
 *
 * The model reads the request and picks exact matches by id; it never sees or
 * sets a price. Every figure a customer sees comes from the extraction chain
 * and the pricing calculator, exactly as for a pasted link.
 */
export const FINDER = {
  /** Request → spec, and listings → exact matches. Small prompts, must be quick and cheap. */
  model: "claude-haiku-5-5",
  /** Budget key in `job_budgets`: one unit per store search page. */
  jobName: "finder-search",
  /**
   * Store searches a month. Each is one ScraperAPI structured search (5 credits)
   * or one Zyte request; a run searches up to three stores, so production's cap
   * is about 100 runs of live search a month before runs fall back to the
   * catalogue alone. Dev shares the keys, so its cap is a token one.
   */
  monthlyCaps: { production: 300, other: 20 } satisfies MonthlyCaps,
  /** A run stops starting new work after this long and finishes with what it has. */
  deadlineMs: 210_000,
  /**
   * A `running` run older than this lost its worker (deploy, crash, timeout).
   * Above the deadline plus a slow email, so a live run is never stolen.
   */
  staleRunningMs: 270_000,
  /** A `pending` run `after()` never started; the sweep starts it. */
  stalePendingMs: 60_000,
  /** Tries before a run is failed for good. */
  maxAttempts: 2,
  understandTimeoutMs: 12_000,
  shortlistTimeoutMs: 15_000,
  /** One store's search page. ScraperAPI eBay measured at 25 s. */
  storeSearchTimeoutMs: 75_000,
  /** The freight inspector, when a candidate's freight is still being checked. */
  freightCheckTimeoutMs: 30_000,
  /** How many shortlisted matches go through the full extraction and calculator. */
  priceCandidates: 3,
  /** Listings handed to the model for the shortlist; the rest are not read. */
  maxListingsForShortlist: 40,
  /** Catalogue rows considered alongside the live search. */
  catalogueLimit: 12,
  /** A repeat of the same request by the same viewer inside this window returns the earlier run. */
  cacheHours: 24,
  /** Over budget by more than this share is a clear miss and is dropped. */
  overBudgetMargin: 0.15,
  minQueryLength: 2,
  maxQueryLength: 160,
} as const;
