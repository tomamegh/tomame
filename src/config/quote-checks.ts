import type { MonthlyCaps } from "./catalog";

/**
 * Vendor budgets for the price checks of plan A0 (migration 103). Both are
 * metered in `job_budgets` like the catalogue scrape: dev and prod share the
 * vendor keys, so dev's cap stays small.
 */

/** The background re-read of a single-source price before Pay: one chain run (one or two vendor calls). */
export const PRICE_REREAD_JOB = {
  jobName: "price-reread",
  monthlyCaps: { production: 1500, other: 30 } satisfies MonthlyCaps,
  /** One chain run; the structured tiers answer in 2–9 s. */
  budgetMs: 25_000,
} as const;

/** `scripts/extraction-accuracy-audit.ts`: every tier, every sampled URL. */
export const ACCURACY_AUDIT_JOB = {
  jobName: "accuracy-audit",
  monthlyCaps: { production: 600, other: 20 } satisfies MonthlyCaps,
  /** URLs per run unless `--limit` says otherwise. */
  defaultSample: 50,
} as const;
