import type { AdminTone } from "@/components/layout/admin";
import { PRICE_WATCH_JOB } from "@/config/security";

/**
 * Display helpers for `/admin/watches`.
 *
 * The admin question about price watches is not "what are people watching" but
 * "is the job still doing its work". Three facts answer that and each has a
 * helper here: how a watch is doing (`watchHealth`), whether the job has run
 * recently enough to be believed (`jobHealth`), and whether a watch has been
 * checked inside its own due window.
 *
 * `is_active` carries two meanings on this table — the customer paused it, and
 * the job retired it after `PRICE_WATCH_JOB.maxConsecutiveFailures` — so the
 * failure counter is what separates them, exactly as
 * `listRetiredWatchesByUser` documents. A screen that showed one label for both
 * would hide the only case an admin can act on.
 *
 * Pure, `now` passed in. British English.
 */

export type WatchHealth =
  /** Checked, recently, without error. */
  | "healthy"
  /** Active, but the last check or several failed. Heading for retirement. */
  | "failing"
  /** Active and never checked. New, or the job is not running. */
  | "unchecked"
  /** Inactive with failures behind it: the job gave up. */
  | "retired"
  /** Inactive with no failures: the customer stopped it. */
  | "stopped";

export function watchHealth(watch: {
  is_active: boolean;
  consecutive_failures: number;
  last_checked_at: string | null;
}): WatchHealth {
  if (!watch.is_active) return watch.consecutive_failures > 0 ? "retired" : "stopped";
  if (watch.consecutive_failures > 0) return "failing";
  if (watch.last_checked_at == null) return "unchecked";
  return "healthy";
}

export function watchHealthBadge(health: WatchHealth): { label: string; tone: AdminTone } {
  switch (health) {
    case "healthy":
      return { label: "Checking", tone: "green" };
    case "failing":
      // Amber: a person has to decide whether the link is dead or the resolver
      // is broken, and nobody has.
      return { label: "Failing", tone: "amber" };
    case "unchecked":
      return { label: "Never checked", tone: "amber" };
    case "retired":
      return { label: "Retired by the job", tone: "coral" };
    case "stopped":
      return { label: "Stopped by the customer", tone: "muted" };
  }
}

/**
 * How many failures a watch has left before the job retires it.
 *
 * Reported as a countdown rather than a raw counter because the counter alone
 * means nothing without the ceiling — "3 failures" is halfway to gone or
 * nowhere near it depending on a constant the admin cannot see.
 */
export function failuresRemaining(consecutiveFailures: number): number {
  return Math.max(0, PRICE_WATCH_JOB.maxConsecutiveFailures - consecutiveFailures);
}

export function failureLabel(consecutiveFailures: number): string | null {
  if (consecutiveFailures <= 0) return null;
  const left = failuresRemaining(consecutiveFailures);
  if (left === 0) return `${consecutiveFailures} failed checks — retired`;
  return `${consecutiveFailures} failed ${consecutiveFailures === 1 ? "check" : "checks"}, ${left} from retirement`;
}

/**
 * Is the batch job actually running?
 *
 * pg_cron fires `recheck_price_watches()` every ten minutes and each run claims
 * only watches whose last check is older than `recheckAfterHours` — so once
 * everybody has had a turn, runs claim nothing and `last_checked_at` stops
 * moving. That means "no check in the last ten minutes" is NOT a fault, and the
 * honest test is whether anything has been checked inside a window a bit wider
 * than the recheck period itself.
 *
 * `activeWatches === 0` is its own answer: there is nothing to check, so a job
 * that has done nothing is behaving correctly and must not be reported as
 * broken.
 */
export type JobHealth = "idle" | "running" | "silent" | "never_run";

export function jobHealth(input: {
  activeWatches: number;
  lastCheckedAt: string | null;
  now: Date;
}): JobHealth {
  if (input.activeWatches === 0) return "idle";
  if (input.lastCheckedAt == null) return "never_run";

  const last = new Date(input.lastCheckedAt).getTime();
  if (Number.isNaN(last)) return "never_run";

  // One full recheck window plus an hour of slack: inside that, a quiet job is
  // a job with nothing due.
  const staleAfterMs = (PRICE_WATCH_JOB.recheckAfterHours + 1) * 60 * 60 * 1000;
  return input.now.getTime() - last > staleAfterMs ? "silent" : "running";
}

export function jobHealthMessage(health: JobHealth): { label: string; tone: AdminTone; body: string } {
  switch (health) {
    case "idle":
      return {
        label: "Nothing to check",
        tone: "muted",
        body: "No customer has an active watch, so the job claims nothing and returns immediately. That is correct behaviour, not a fault.",
      };
    case "running":
      return {
        label: "Running",
        tone: "green",
        body: `Watches are being re-checked. Each one comes round again about every ${PRICE_WATCH_JOB.recheckAfterHours} hours, in batches of ${PRICE_WATCH_JOB.batchSize} fired every ten minutes.`,
      };
    case "silent":
      return {
        label: "Nothing checked recently",
        tone: "coral",
        body: `There are active watches, and none has been checked in over ${PRICE_WATCH_JOB.recheckAfterHours + 1} hours. Either pg_cron is not firing recheck_price_watches(), or the app is rejecting it — the usual cause is an unset "app_url" or "cron_secret" vault secret.`,
      };
    case "never_run":
      return {
        label: "Never run",
        tone: "coral",
        body: "There are active watches and not one has ever been checked. The job has not reached the app on this environment.",
      };
  }
}

/**
 * What the last check actually cost, in words an admin can act on.
 *
 * Every re-check is a full extraction against a paid vendor. Unlike the
 * catalogue scrape, the price-watch job records NOTHING in `job_budgets`
 * (migration 045 meters `catalog-scrape` only), so there is no spend figure to
 * show and this screen must not print a reassuring zero. It reports the number
 * of checks, which is a real count, and says they are unmetered.
 */
export function unmeteredSpendNote(observations: number): string {
  if (observations === 0) {
    return "No successful check has been recorded in the last week, so no vendor call has been paid for by this job. Price-watch checks are not metered in job_budgets — only the catalogue scrape is.";
  }
  return `${observations.toLocaleString("en-GB")} successful checks in the last week, each a paid extraction. Price-watch checks are not metered in job_budgets — only the catalogue scrape is — so there is no spend figure to show against a cap.`;
}
