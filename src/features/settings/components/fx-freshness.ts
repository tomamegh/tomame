/**
 * How old an `exchange_rates` row is, and whether that is a problem.
 *
 * WHY THE ADMIN NEEDS THIS SPELLED OUT. Every quote is converted at the stored
 * USD→GHS rate plus the buffer. If the rates job stops — a lapsed provider key,
 * an unset `app_url` vault secret, a cron that was never scheduled on this
 * database — nothing breaks loudly: the platform keeps quoting, at yesterday's
 * cedi. That is a business loss per order, and the only place it is visible is
 * this screen, so the screen has to say it in words.
 *
 * The thresholds are derived, not invented: migration 026 schedules the fetch
 * at `0 0,4,8,12,16,20 * * *`, so one interval is four hours. A row that has
 * survived two intervals means a run was missed; a row older than a day means
 * the job is not running at all.
 */

/** Hours between scheduled fetches — migration 026's cron expression. */
export const RATE_REFRESH_INTERVAL_HOURS = 4;

export type RateFreshness = "fresh" | "late" | "stale" | "unknown";

export interface RateAge {
  state: RateFreshness;
  /** Whole hours since the row was fetched. Null when the timestamp is junk. */
  hours: number | null;
}

export function rateAge(fetchedAt: string | null | undefined, now: Date): RateAge {
  if (!fetchedAt) return { state: "unknown", hours: null };
  const then = new Date(fetchedAt);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) {
    return { state: "unknown", hours: null };
  }

  const elapsedMs = now.getTime() - then.getTime();
  // A future timestamp is clock skew between the database and the renderer, not
  // a fresh rate from tomorrow. Treat it as brand new rather than as negative.
  const hours = Math.max(0, Math.floor(elapsedMs / 3_600_000));

  if (hours >= 24) return { state: "stale", hours };
  if (hours >= RATE_REFRESH_INTERVAL_HOURS * 2) return { state: "late", hours };
  return { state: "fresh", hours };
}

/** The sentence the card prints under the rate. Never a bare number. */
export function describeRateAge(age: RateAge): string {
  switch (age.state) {
    case "unknown":
      return "No fetch time recorded against this rate.";
    case "stale":
      return `Last fetched ${age.hours} hours ago. The rates job has not run for a day, so every quote since is being priced at an old cedi.`;
    case "late":
      return `Last fetched ${age.hours} hours ago. That is more than two scheduled runs; the rates job may have stopped.`;
    case "fresh":
      return age.hours === 0
        ? "Fetched within the hour."
        : `Fetched ${age.hours} ${age.hours === 1 ? "hour" : "hours"} ago.`;
  }
}
