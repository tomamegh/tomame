/**
 * Journey stage vocabulary — the canonical `orders.status` → display mapping.
 *
 * Pure and framework-free on purpose: no `server-only`, no Supabase, no React.
 * It is imported by server services and by client components alike.
 *
 * WHAT THIS IS NOT. There is no per-stage timestamp model in the schema: an
 * order carries one `status` and (from the `in_transit` transition onwards) one
 * admin-entered `estimated_delivery_date`. So the number this module returns is
 * a STAGE POSITION on a five-stop track — "which stop is lit" — and NOT progress
 * through time. It never moves between status changes, and nothing here should
 * be presented as "x% of the way there" or used to interpolate a date. When the
 * ETA is absent we return null and hand back a hint instead; we never invent
 * "Lands Sat".
 *
 * Sources: `docs/phase-2-handoff.md` §6 build notes, `docs/redesign-data-map.md`
 * §0.3. This is the ONE place a status becomes words. The five duplicate label
 * maps the data map recorded as debt now read from `ORDER_STATUS_OPTIONS` and
 * `journeyStageFor` below, so "In the air" cannot be "In Transit" on one screen
 * and something else on the next.
 */

import { ORDER_STATUSES, type OrderStatus } from "@/config/constants";

export type JourneyTone = "coral" | "amber" | "green" | "neutral";

export interface JourneyStop {
  key: string;
  label: string;
}

/**
 * The five stops the Home mini-track draws, in order. Exported so the UI renders
 * the track from this list rather than hardcoding five labels in JSX.
 *
 * COPY NOTE: the stop word is "Purchased", never "Bought" (handoff §4). The
 * status label for `processing` is "Being purchased" — the sentence form of the
 * same word, so there is no discrepancy between the mapping and the copy rule:
 * the label describes the state, the stop names the milestone.
 */
export const JOURNEY_STOPS: readonly JourneyStop[] = [
  { key: "paid", label: "Paid" },
  { key: "purchased", label: "Purchased" },
  { key: "hub", label: "Hub" },
  { key: "in_the_air", label: "In the air" },
  { key: "your_door", label: "Your door" },
];

export interface JourneyStage {
  /** The raw `orders.status` this was derived from. */
  status: string;
  /** Customer-facing label for the state, e.g. "Being purchased". */
  label: string;
  /** Which of `JOURNEY_STOPS` is lit, or null when the order is off-track. */
  stopKey: string | null;
  /**
   * Position of that stop along the track, 0–100. A stage position, not
   * progress through time — see the module comment.
   */
  trackPercent: number;
  /** Colour token the UI should use, so it does not re-derive one per screen. */
  tone: JourneyTone;
  /** What to show where an ETA would go when no delivery date is set. */
  hint: string;
  /** Delivered or completed. */
  isComplete: boolean;
  /** Cancelled — off the track entirely, not "0% along it". */
  isCancelled: boolean;
}

const STAGES: Record<string, JourneyStage> = {
  pending: {
    status: "pending",
    label: "Awaiting payment",
    stopKey: null,
    trackPercent: 5,
    tone: "amber",
    hint: "Pay to start",
    isComplete: false,
    isCancelled: false,
  },
  paid: {
    status: "paid",
    label: "Paid",
    stopKey: "paid",
    trackPercent: 20,
    tone: "coral",
    hint: "Date set when it ships",
    isComplete: false,
    isCancelled: false,
  },
  processing: {
    status: "processing",
    label: "Being purchased",
    stopKey: "purchased",
    trackPercent: 40,
    tone: "coral",
    hint: "Date set when it ships",
    isComplete: false,
    isCancelled: false,
  },
  in_transit: {
    status: "in_transit",
    label: "In the air",
    stopKey: "in_the_air",
    trackPercent: 75,
    tone: "coral",
    hint: "Date to be confirmed",
    isComplete: false,
    isCancelled: false,
  },
  delivered: {
    status: "delivered",
    label: "Delivered",
    stopKey: "your_door",
    trackPercent: 100,
    tone: "green",
    hint: "Delivered",
    isComplete: true,
    isCancelled: false,
  },
  completed: {
    status: "completed",
    label: "Delivered",
    stopKey: "your_door",
    trackPercent: 100,
    tone: "green",
    hint: "Delivered",
    isComplete: true,
    isCancelled: false,
  },
  cancelled: {
    status: "cancelled",
    label: "Cancelled",
    stopKey: null,
    trackPercent: 0,
    tone: "neutral",
    hint: "Cancelled",
    isComplete: false,
    isCancelled: true,
  },
};

/**
 * Fallback for a status this map has never seen — a status added to the database
 * before this file learns about it. It says so plainly rather than guessing a
 * position on the track, which would be a lie the UI could not detect.
 */
function unknownStage(status: string): JourneyStage {
  return {
    status,
    label: "Unknown",
    stopKey: null,
    trackPercent: 0,
    tone: "neutral",
    hint: "Status not recognised",
    isComplete: false,
    isCancelled: false,
  };
}

/** Display information for one `orders.status`. Total: never throws. */
export function journeyStageFor(status: string): JourneyStage {
  // `Object.hasOwn` rather than a bare index: `STAGES["constructor"]` and
  // `STAGES["toString"]` would otherwise resolve up the prototype chain and hand
  // back a function instead of falling through to `unknownStage`.
  return Object.hasOwn(STAGES, status) ? STAGES[status]! : unknownStage(status);
}

export interface JourneyView extends JourneyStage {
  /**
   * `orders.estimated_delivery_date` verbatim (an ISO `YYYY-MM-DD` date), and
   * ONLY when an admin has actually set one. Null otherwise — the UI shows
   * `hint` instead. Nothing here derives, estimates or formats a date.
   */
  etaDate: string | null;
}

export function describeJourney(input: {
  status: string;
  estimatedDeliveryDate: string | null | undefined;
}): JourneyView {
  const stage = journeyStageFor(input.status);
  return { ...stage, etaDate: normalizeEta(input.estimatedDeliveryDate) };
}

/** Empty strings are treated as "not set"; Postgres NULL arrives as null. */
function normalizeEta(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ── The one status vocabulary ────────────────────────────────────────────────

/**
 * Every order status with the word the product uses for it, in lifecycle order.
 *
 * Derived from `ORDER_STATUSES` rather than typed out again, so a status added
 * to the enum cannot be silently missing from a filter: it appears here, and
 * `journeyStageFor` answers "Unknown" for it until this file learns its stage —
 * visible, rather than absent.
 *
 * The words are the customer's ("Being purchased", "In the air"), used on admin
 * screens too. A buyer and a customer talking on WhatsApp should be looking at
 * the same vocabulary, not translating between two.
 */
export const ORDER_STATUS_OPTIONS: readonly { value: OrderStatus; label: string }[] =
  Object.values(ORDER_STATUSES).map((value) => ({ value, label: journeyStageFor(value).label }));

/**
 * Badge colouring from the stage's own tone, so a status cannot be amber on one
 * screen and purple on another. `neutral` covers cancelled and unknown alike:
 * neither is a position on the track.
 */
export const JOURNEY_TONE_BADGE_CLASS: Record<JourneyTone, string> = {
  coral: "bg-orange-50 text-orange-700 border-orange-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  neutral: "bg-stone-100 text-stone-600 border-stone-200",
};
