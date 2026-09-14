import type {
  OrderFeedbackStatus,
  OrderFeedbackVerdict,
} from "@/db/queries/order-feedback";
import type { OrderPhotoKind } from "@/db/queries/order-photos";
import { formatGhs, formatPercent, formatUsd } from "@/features/marketing/format";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import type { JourneyCtaKind, JourneyEta } from "./types";

/**
 * Pure formatting for the Journeys screens.
 *
 * Framework-free so it can be unit tested without a DOM and shared by the server
 * services and the client components. Nothing here reads a clock, a database or
 * `process.env`: every function is a total function of its arguments.
 */

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * "28 Aug" — the mock's short day (design line 302).
 *
 * Built from `formatToParts` rather than a format string because en-GB spells
 * September "Sept" and the mock (and Ghanaian usage) says "Sep". Accra is GMT
 * year-round, so UTC is also the customer's local day and no timezone library
 * is needed.
 */
export function formatShortDay(iso: string | null | undefined): string | null {
  const date = parseDate(iso);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month").slice(0, 3)}`;
}

/** "Thu 18 Sep" — the weekday form the ETA tile uses. */
export function formatWeekdayDay(iso: string | null | undefined): string | null {
  const date = parseDate(iso);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month").slice(0, 3)}`;
}

/** "Sep 8 · 22:14" — the Updates timeline's stamp (design line 351). */
export function formatEventStamp(iso: string | null | undefined): string | null {
  const date = parseDate(iso);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month").slice(0, 3)} ${get("day")} · ${get("hour")}:${get("minute")}`;
}

/**
 * "Thu 18 – Sat 20 Sep" for a window, "Thu 18 Sep" when both ends are the same
 * day, and null when neither end is set — the tile is then not drawn at all
 * rather than showing "To be confirmed" where a date belongs.
 *
 * The shared month is printed once, as the mock does, but only when both ends
 * fall in it: an 28 Sep – 2 Oct window must keep both.
 */
export function formatEtaWindow(eta: JourneyEta | null): string | null {
  if (!eta) return null;
  const from = eta.from ?? eta.to;
  const to = eta.to ?? eta.from;
  if (!from || !to) return null;
  if (from === to) return formatWeekdayDay(from);

  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return null;

  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  const startText = sameMonth
    ? dropMonth(formatWeekdayDay(from))
    : formatWeekdayDay(from);
  const endText = formatWeekdayDay(to);
  if (!startText || !endText) return null;

  return `${startText} – ${endText}`;
}

/** "Thu 18 Sep" → "Thu 18". Only used when the other end carries the month. */
function dropMonth(text: string | null): string | null {
  if (!text) return null;
  const parts = text.split(" ");
  return parts.length > 2 ? parts.slice(0, -1).join(" ") : text;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // A bare `YYYY-MM-DD` parses as UTC midnight; a full timestamp keeps its zone.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ── Labels ──────────────────────────────────────────────────────────────────

const CTA_LABELS: Record<JourneyCtaKind, string> = {
  track: "Track",
  details: "Details",
  pay: "Pay now",
  buy_again: "Buy again",
};

export function ctaLabel(kind: JourneyCtaKind): string {
  return CTA_LABELS[kind];
}

/** "Qty 2 · GH₵612.40", dropping either half when it is missing. */
export function formatRowMeta(quantity: number, totalGhs: number | null): string {
  const parts = [`Qty ${quantity}`, totalGhs != null ? formatGhs(totalGhs) : null];
  return parts.filter((part): part is string => !!part).join(" · ");
}

/** "Amazon · TM-00042 · 28 Aug" — the row's eyebrow. Store is dropped when unknown. */
export function formatRowEyebrow(
  store: string | null,
  orderNo: string,
  createdAt: string,
): string {
  return [store, orderNo, formatShortDay(createdAt)]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/** "2 of 3 in this bag" — only drawn when the order has siblings. */
export function formatGroupPosition(
  position: { index: number; total: number } | null,
): string | null {
  if (!position || position.total < 2) return null;
  return `${position.index} of ${position.total} in this bag`;
}

// ── "What you paid" ─────────────────────────────────────────────────────────

export interface PaidRow {
  key: string;
  label: string;
  value: string;
  tone?: "muted";
}

/**
 * The receipt rows of `v2-detail`'s "What you paid" (design line 358).
 *
 * Every line is read from the STORED breakdown — the one struck when the order
 * was created — and nothing is recomputed here. A component that multiplied a
 * rate by a subtotal would be doing money arithmetic in the browser, and would
 * drift from what the customer was actually charged the first time a constant
 * changed.
 *
 * Rows with nothing in them are omitted rather than shown as zero: an order from
 * a region with no sales tax should not carry a "US sales tax $0.00" line.
 */
export function paidRows(pricing: OrderPricingBreakdown): PaidRow[] {
  const rows: PaidRow[] = [
    { key: "item", label: "Item", value: formatUsd(pricing.subtotal_usd) },
  ];

  if (pricing.tax_usd > 0) {
    rows.push({
      key: "tax",
      label: `US sales tax ${formatPercent(pricing.tax_percentage)}`,
      value: formatUsd(pricing.tax_usd),
    });
  }

  if (pricing.value_fee_usd > 0) {
    rows.push({
      key: "fee",
      label: `Tomame fee ${formatPercent(pricing.value_fee_percentage)}`,
      value: formatUsd(pricing.value_fee_usd),
    });
  }

  if (pricing.flat_rate_ghs > 0) {
    rows.push({
      key: "freight",
      label: "Freight",
      value: formatGhs(pricing.flat_rate_ghs),
    });
  }

  rows.push({
    key: "rate",
    label: "Rate",
    // Two decimals, the same precision the nav pill quotes, so the two can
    // never look like different rates.
    value: `1 USD = ${pricing.exchange_rate.toFixed(2)}`,
    tone: "muted",
  });

  return rows;
}

/** The figure at the bottom of the receipt: the admin's override when one was set. */
export function paidTotalGhs(
  pricing: OrderPricingBreakdown,
  adminTotalGhs: number | null,
): number {
  return adminTotalGhs != null && Number.isFinite(adminTotalGhs)
    ? adminTotalGhs
    : pricing.total_ghs;
}

// ── Parcel photos and what the customer said about them (054) ───────────────

/**
 * The line above a photograph. The `kind` column is the operator's own
 * classification, so it is rendered as a fact rather than guessed at from the
 * order's status — a parcel can be photographed at the hub long after it is
 * marked processing.
 */
const PHOTO_KIND_LABELS: Record<OrderPhotoKind, string> = {
  hub_received: "At our US hub",
  packed: "Packed for the flight",
  damaged: "Damage we found",
  delivered: "At your door",
  other: "From the warehouse",
};

export function photoKindLabel(kind: OrderPhotoKind): string {
  return PHOTO_KIND_LABELS[kind];
}

/** The alt text for a parcel photograph that carries no caption. */
export function photoAltText(kind: OrderPhotoKind, takenAt: string): string {
  const stamp = formatShortDay(takenAt);
  const where = PHOTO_KIND_LABELS[kind];
  return `Photo of your parcel — ${where}${stamp ? `, ${stamp}` : ""}`;
}

/**
 * How a verdict is read back to the person who gave it.
 *
 * `looks_right` is phrased as the confirmation it is — "you confirmed" — and
 * not as one more complaint in a list. It is the signal the whole feature
 * exists to collect, and the screen should not make giving it feel like filing
 * a ticket.
 */
const VERDICT_LABELS: Record<OrderFeedbackVerdict, string> = {
  looks_right: "You confirmed this looks right",
  wrong_item: "Wrong item",
  wrong_variant: "Wrong size or colour",
  damaged: "Damaged",
  other: "Something else",
};

export function feedbackVerdictLabel(verdict: OrderFeedbackVerdict): string {
  return VERDICT_LABELS[verdict];
}

/** True for every verdict a person has to act on. */
export function isFeedbackComplaint(verdict: OrderFeedbackVerdict): boolean {
  return verdict !== "looks_right";
}

/** The chip beside a complaint: where it has got to in the queue. */
const STATUS_LABELS: Record<OrderFeedbackStatus, string> = {
  open: "Received",
  in_review: "Being looked at",
  resolved: "Sorted",
  dismissed: "Closed",
};

export function feedbackStatusLabel(status: OrderFeedbackStatus): string {
  return STATUS_LABELS[status];
}

const STATUS_NOTES: Record<OrderFeedbackStatus, string> = {
  open: "We have this. Someone will look at it before your parcel moves on.",
  in_review: "A buyer is looking into this now.",
  resolved: "We have dealt with this.",
  dismissed: "We have looked into this.",
};

/**
 * The sentence under what the customer said.
 *
 * A confirmation is never answered with "someone will look at it": nobody has
 * to, and promising a reply we will not send is worse than saying nothing.
 */
export function feedbackStatusNote(
  verdict: OrderFeedbackVerdict,
  status: OrderFeedbackStatus,
): string {
  if (verdict === "looks_right") {
    return "Thank you — that is noted against this parcel.";
  }
  return STATUS_NOTES[status];
}
