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
  /**
   * The shopping assistant's conversation (107): reads the chat, replies, splits the request into searches.
   * Haiku: about $0.0004 a message (Opus measured $0.014 on the same turns), and the prices never come from it.
   */
  chatModel: "claude-haiku-5-5",
  chatTimeoutMs: 30_000,
  /** Budget key in `job_budgets`: one unit per store search page. */
  jobName: "finder-search",
  /**
   * Paid store searches a month (Amazon, Walmart: one ScraperAPI structured
   * search each, 5 credits of the 100k plan). eBay and Target search through
   * their own free APIs and are not counted. Production's cap is about 1,000
   * runs a month (10k credits); dev shares the keys, so its cap is smaller.
   * The stored row's cap is a floor/override (effectiveMonthlyCap).
   */
  monthlyCaps: { production: 2000, other: 200 } satisfies MonthlyCaps,
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
  /** One store read for the fast answer (catalogue match, Amazon or Walmart). A cached read is instant. */
  quickPickReadMs: 25_000,
  /** The model's look at the fast answer's catalogue rows (a dozen at most). */
  quickPickShortlistMs: 8_000,
  /** How long the fast answer waits for Target's search before going with the catalogue alone. */
  quickPickTargetWaitMs: 3_000,
  /** How many shortlisted matches go through the full extraction and calculator. */
  priceCandidates: 3,
  /** Further matches are read in place of unreadable pages only while this much of the deadline is left. */
  extraReadMinMs: 70_000,
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
