import type { AdminTone } from "@/components/layout/admin/admin-page";
import { formatEtaWindow } from "@/features/journeys/format";
import { formatGhs } from "@/features/marketing/format";
import type { Order } from "../types";

/**
 * How an order's figures and dates read on the admin screens.
 *
 * Pure and framework-free, and — this is the point — it NEVER computes money.
 * Every function below chooses between figures that are already stored on the
 * row and formats the one it picked. The pricing engine
 * (`src/lib/pricing/calculator.ts`) is the only thing in the product allowed to
 * arrive at a total, and an admin console that multiplied a rate by a subtotal
 * to "check" it would drift from what the customer was actually charged the
 * first time a constant moved.
 */

export interface OrderTotalDisplay {
  /** Ready to print. `null` is never returned — an unpriced order says so in words. */
  text: string;
  tone: AdminTone;
  /** The admin's hand-set total is what is showing, not the engine's. */
  isOverride: boolean;
  /** There is no total at all yet, and a person has to supply one. */
  isUnpriced: boolean;
}

/**
 * What an order is worth, and where that figure came from.
 *
 * Three cases, in the order the business cares about them:
 *
 * 1. `admin_total_ghs` is set (migration 031) — an admin priced this by hand and
 *    their figure OVERRIDES the breakdown. Shown as the override it is, so
 *    nobody reads a hand-typed number as an engine output.
 * 2. The order is still flagged `needs_review` with no hand price — the engine
 *    could not price it, so there is no total. Said plainly rather than printed
 *    as GH₵0.00, which would be a lie about a real order.
 * 3. Otherwise the stored breakdown's `total_ghs`, verbatim.
 */
export function orderTotalDisplay(order: Order): OrderTotalDisplay {
  const override = order.admin_total_ghs;
  if (override != null && Number.isFinite(override)) {
    return { text: formatGhs(override), tone: "neutral", isOverride: true, isUnpriced: false };
  }

  const engineTotal = order.pricing?.total_ghs;
  const priceable =
    order.pricing?.pricing_method !== "needs_review" &&
    engineTotal != null &&
    Number.isFinite(engineTotal);

  if (!priceable) {
    return { text: "Not priced", tone: "amber", isOverride: false, isUnpriced: true };
  }

  return { text: formatGhs(engineTotal), tone: "neutral", isOverride: false, isUnpriced: false };
}

/**
 * The delivery window in the customer's own words, or null when none is set.
 *
 * Null rather than "To be confirmed": the caller decides what belongs in an
 * empty cell, and a table that prints a placeholder in every row of a column
 * nobody has filled in reads as though the data exists.
 */
export function orderEtaDisplay(order: Order): string | null {
  const from = order.eta_from ?? null;
  const to = order.eta_to ?? null;
  if (from || to) return formatEtaWindow({ from, to, source: "confirmed" });

  // Pre-050 orders carry only the single date. Shown as the one-day window it
  // effectively is, never widened into a range nobody entered.
  const single = order.estimated_delivery_date;
  return single ? formatEtaWindow({ from: single, to: single, source: "confirmed" }) : null;
}

/**
 * The window's two ends as `YYYY-MM-DD`, for pre-filling the date inputs.
 *
 * Falls back to `estimated_delivery_date` on both ends for a pre-050 order, so
 * an operator editing one starts from what is actually stored rather than from
 * an empty form that would clear it on save.
 */
export function orderEtaFields(order: Order): { from: string; to: string } {
  const single = order.estimated_delivery_date ?? "";
  return {
    from: order.eta_from ?? single,
    to: order.eta_to ?? single,
  };
}

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * "13 Sep 2026". Accra is GMT all year, so UTC is also the operator's local day
 * and no timezone library is needed — the same assumption the customer-facing
 * `journeys/format.ts` makes.
 */
export function formatAdminDate(iso: string | null | undefined): string | null {
  const date = parse(iso);
  if (!date) return null;
  const get = partsOf(date, { day: "numeric", month: "short", year: "numeric" });
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/** "13 Sep 2026, 14:02" — for a log line, where the time of day matters. */
export function formatAdminDateTime(iso: string | null | undefined): string | null {
  const date = parse(iso);
  if (!date) return null;
  const get = partsOf(date, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`;
}

/**
 * Assembled from parts rather than from a format string because en-GB spells
 * September "Sept" and the product says "Sep" everywhere else — `journeys/format.ts`
 * trims it the same way, and the admin must not be the one screen that disagrees.
 */
function partsOf(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): (type: string) => string {
  const parts = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).formatToParts(
    date,
  );
  return (type: string) => {
    const value = parts.find((part) => part.type === type)?.value ?? "";
    return type === "month" ? value.slice(0, 3) : value;
  };
}

/**
 * "3 days ago", "just now" — how long something has been sitting.
 *
 * Takes `now` rather than reading the clock so it is a total function of its
 * arguments and its test does not have to freeze time. Returns null for an
 * unreadable timestamp: an age nobody can compute must not print as "56 years".
 */
export function formatAge(iso: string | null | undefined, now: Date): string | null {
  const date = parse(iso);
  if (!date) return null;

  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // A bare `YYYY-MM-DD` parses as UTC midnight; a full timestamp keeps its zone.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
