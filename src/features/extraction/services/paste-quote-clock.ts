import { QUOTE_VALID_HOURS } from "@/config/constants";
import type { ExtractionJobRow, PasteOutcome } from "@/db/queries/extraction-requests";

/**
 * The free quote's 24-hour clock (110, site brief Fix 1.6). Framework free: the
 * paste status and the job service both read it.
 */

const PRICED: ReadonlySet<PasteOutcome> = new Set(["priced", "priced_from_cache", "priced_by_staff"]);
export const isPricedOutcome = (o: PasteOutcome | null | undefined): boolean => o != null && PRICED.has(o);

type Clocked = Pick<ExtractionJobRow, "outcome" | "outcome_at">;

/**
 * Never extended: a paste that was already priced inside the window keeps its
 * start, so a re-paste cannot buy more time. Anything else starts now.
 */
export function outcomeClock(row: Clocked, next: PasteOutcome, now: Date): string {
  if (isPricedOutcome(next) && isPricedOutcome(row.outcome) && row.outcome_at) {
    const started = Date.parse(row.outcome_at);
    if (Number.isFinite(started) && now.getTime() - started < QUOTE_VALID_HOURS * 3_600_000) return row.outcome_at;
  }
  return now.toISOString();
}

/** When a priced paste's free quote ends; null for anything that is not a priced outcome. */
export function quoteExpiresAt(row: Clocked): string | null {
  if (!isPricedOutcome(row.outcome) || !row.outcome_at) return null;
  const started = Date.parse(row.outcome_at);
  return Number.isFinite(started) ? new Date(started + QUOTE_VALID_HOURS * 3_600_000).toISOString() : null;
}
