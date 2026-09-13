import type { AdminTone } from "@/components/layout/admin";
import { formatGhs } from "@/features/marketing/format";

/**
 * Display helpers for `/admin`.
 *
 * `AdminStat` takes an already-formatted string and never computes, so every
 * figure on the dashboard is turned into words exactly once — here, in pure
 * functions that take `now` rather than reading the clock. A component that
 * called `Date.now()` during render would disagree with the server that built
 * the view model, and "in 2 hours" would flicker to "in 1 hour" on hydration.
 *
 * British English throughout, as the rest of the product is.
 */

const countFormatter = new Intl.NumberFormat("en-GB");

/** 1234 → "1,234". */
export function formatCount(value: number): string {
  return countFormatter.format(value);
}

/**
 * A success rate, 0–1, as whole percent. Null prints as an em dash: the service
 * returns null when nothing has finished, and "0%" would accuse the extractor
 * of failing every paste when in truth it has not been asked.
 */
export function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** Money, cedis in and cedis out. Never takes pesewas — see admin-money-format. */
export { formatGhs };

/**
 * "at least GH₵12,340.00" when a windowed figure hit the query's row cap.
 *
 * The alternative — printing the capped sum as a total — is the failure mode
 * this whole screen exists to avoid: a number that is specific, plausible and
 * quietly too low.
 */
export function formatGhsFloor(amount: number, truncated: boolean): string {
  return truncated ? `at least ${formatGhs(amount)}` : formatGhs(amount);
}

const dayMonthFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const dayMonthYearFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "15 Aug" from a `YYYY-MM-DD` key. UTC throughout, because Ghana is GMT all
 * year and the service buckets by UTC day — formatting in the viewer's zone
 * would shift the chart's axis off its own buckets for anyone travelling.
 */
export function formatDayKey(dateKey: string): string {
  return dayMonthFormatter.format(new Date(`${dateKey}T00:00:00Z`));
}

/** "15 Aug – 13 Sep 2026". The chart and the money tiles both state their range. */
export function formatDateRange(startKey: string, endKey: string): string {
  return `${dayMonthFormatter.format(new Date(`${startKey}T00:00:00Z`))} – ${dayMonthYearFormatter.format(
    new Date(`${endKey}T00:00:00Z`),
  )}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** "13 Sep, 14:32". Null on junk rather than the string "Invalid Date". */
export function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return dateTimeFormatter.format(date);
}

/**
 * How long until a deadline, from the render's own instant.
 *
 * Rounds DOWN on hours and days, which is the safe direction for a cutoff: "in
 * 2 hours" when 2 h 50 m remain sends somebody to the box early, and "in 3
 * hours" with 2 h 10 m left sends them late. Anything already past reads "now" —
 * the caller only ever passes future cutoffs, but a clock that drifted a second
 * between the query and the render must not produce "in -1 minutes".
 */
export function formatCountdown(iso: string, now: Date): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "soon";

  const minutes = Math.floor((target - now.getTime()) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${hours} ${plural(hours, "hour")}`;

  const days = Math.floor(hours / 24);
  return `in ${days} ${plural(days, "day")}`;
}

/** "3 orders" / "1 order". Used everywhere a detail line counts something. */
export function pluralise(count: number, singular: string, plural_?: string): string {
  return `${formatCount(count)} ${plural(count, singular, plural_)}`;
}

function plural(count: number, singular: string, plural_?: string): string {
  return count === 1 ? singular : (plural_ ?? `${singular}s`);
}

// ── Tones ────────────────────────────────────────────────────────────────────

/**
 * The tone of a queue tile.
 *
 * Amber when somebody is waiting, green when nobody is. Green is the load-
 * bearing half: an empty queue is GOOD NEWS and the dashboard says so with a
 * colour and a sentence, rather than leaving a grey zero that reads as a tile
 * that failed to load.
 */
export function queueTone(count: number): AdminTone {
  return count > 0 ? "amber" : "green";
}

/**
 * The tone of the extraction success rate.
 *
 * The thresholds are deliberately generous. Extraction races paid vendors
 * against stores that actively resist them, so a perfect score is not the
 * expectation — but below three quarters a real share of customers is being
 * shown a dead link, and that is a person's problem to go and look at.
 */
export function extractionTone(rate: number | null): AdminTone {
  if (rate == null) return "muted";
  if (rate >= 0.9) return "green";
  if (rate >= 0.75) return "amber";
  return "coral";
}

/**
 * The tone and wording of an order status.
 *
 * The labels are the state machine's own (CLAUDE.md), humanised — no screen in
 * the admin may invent a state the database cannot be in. `pending` is the
 * pre-payment state that migration 004 spells `pending`; the storefront calls
 * it "awaiting payment", and so does this.
 */
export function orderStatusLabel(status: string): string {
  switch (status) {
    case "pending":
    case "pending_payment":
      return "Awaiting payment";
    case "paid":
      return "Paid";
    case "processing":
      return "Processing";
    case "in_transit":
      return "In transit";
    case "delivered":
      return "Delivered";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}

export function orderStatusTone(status: string): AdminTone {
  switch (status) {
    case "delivered":
    case "completed":
      return "green";
    case "pending":
    case "pending_payment":
      return "amber";
    case "cancelled":
      return "muted";
    default:
      return "neutral";
  }
}
