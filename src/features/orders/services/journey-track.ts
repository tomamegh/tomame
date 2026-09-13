/**
 * The five-stop journey track — `v2-detail`'s stage rail (design line 340) and
 * the Journeys list's progress bar, derived from the SEVEN real order statuses
 * plus `order_events`.
 *
 * WHY THIS EXISTS SEPARATELY FROM `journey-stage.ts`. That module answers "what
 * does this status look like" — one label, one tone, one badge — and Home uses
 * it. This module answers "where is the parcel on a five-stop map", which is a
 * different question the moment `order_events` exists: a parcel can be at the US
 * hub while its status is still `processing`, because **"US hub" is not a
 * status**. `ORDER_STATUSES` (src/config/constants.ts) and `ALLOWED_TRANSITIONS`
 * (orders.service.ts) are deliberately untouched — the data map is explicit that
 * the fifth stop is "an `order_events` row of kind `hub_received` exists", not an
 * eighth state in the machine.
 *
 * Pure and framework-free: no `server-only`, no Supabase, no React. Imported by
 * the server services that build the view models and by the client components
 * that render them.
 *
 * NOTHING HERE INVENTS A DATE. A stop's sub-line exists only when a row carries
 * the timestamp it would print. A stop the customer has reached with no event
 * behind it shows its label and nothing else, rather than a plausible guess.
 */

import type { OrderEventKind } from "@/db/queries/order-events";

// ── Inputs ──────────────────────────────────────────────────────────────────

/** The subset of an `order_events` row the track reads. */
export interface TrackEvent {
  kind: OrderEventKind;
  title: string;
  detail: string | null;
  location: string | null;
  weight_lbs: number | null;
  occurred_at: string;
}

export interface TrackInput {
  /** Raw `orders.status`. */
  status: string;
  /** This order's customer-visible events, in any order. */
  events: readonly TrackEvent[];
  /** `orders.eta_from` / `orders.eta_to` (050). Both null until an operator sets them. */
  etaFrom?: string | null;
  etaTo?: string | null;
  /** `orders.delivered_at`, the one delivery timestamp that predates `order_events`. */
  deliveredAt?: string | null;
}

// ── Outputs ─────────────────────────────────────────────────────────────────

export type TrackStopKey = "paid" | "purchased" | "hub" | "in_the_air" | "your_door";

/**
 * `done` — behind the parcel. `now` — where it is. `up` — still ahead.
 * The mock's own three states (`T(...)` in the mock's renderVals).
 */
export type TrackStopState = "done" | "now" | "up";

export interface TrackStop {
  key: TrackStopKey;
  label: string;
  state: TrackStopState;
  /**
   * The second line: "28 Aug · MoMo", "6 Sep · New York", "Est. 18–20 Sep".
   * **Null when nothing recorded supports one** — the UI then renders the label
   * alone. Dates are ISO here; formatting for Accra is the component's job.
   */
  at: string | null;
  /** The event's `detail`/`location`/weight, already merged into one clause, or null. */
  note: string | null;
  /** ISO window for the final stop, when an operator has set one. */
  etaFrom: string | null;
  etaTo: string | null;
}

export interface JourneyTrack {
  stops: TrackStop[];
  /**
   * Fill of the rail, 0–100. A STAGE POSITION, not progress through time — see
   * `journey-stage.ts`. Never interpolated between stops.
   */
  percent: number;
  /** True when the order is cancelled: the track is drawn dim and nothing is "now". */
  isCancelled: boolean;
  /** True once the parcel is at the door. */
  isComplete: boolean;
  /** Whether an `order_events` row of kind `hub_received` exists — the "US hub" test. */
  reachedHub: boolean;
}

// ── The ladder ──────────────────────────────────────────────────────────────

const STOP_LABELS: Record<TrackStopKey, string> = {
  paid: "Paid",
  purchased: "Purchased",
  // The mock says "US hub". The lane is USA-only today (`regions`), but the
  // wording is deliberately origin-free: a UK lane opening must not turn this
  // label into a lie, and the hub's actual city rides in the sub-line.
  hub: "Our hub",
  in_the_air: "In the air",
  your_door: "Your door",
};

const STOP_ORDER: readonly TrackStopKey[] = [
  "paid",
  "purchased",
  "hub",
  "in_the_air",
  "your_door",
];

/**
 * How far the STATUS alone carries a parcel.
 *
 * `in_transit` maps to 3 and not 2: the hub is skipped, because a status can
 * never prove a hub arrival. -1 means "not started" (`pending`): nothing on the
 * track is lit and the whole rail is empty rather than one-fifth full.
 */
const STATUS_INDEX: Record<string, number> = {
  pending: -1,
  paid: 0,
  processing: 1,
  in_transit: 3,
  delivered: 4,
  completed: 4,
};

/** Which stop an event vouches for, when it vouches for one at all. */
const EVENT_INDEX: Partial<Record<OrderEventKind, number>> = {
  payment_received: 0,
  purchased: 1,
  hub_received: 2,
  departed: 3,
  arrived_country: 3,
  out_for_delivery: 3,
  delivered: 4,
};

/** The event whose timestamp and wording each stop prints, most specific first. */
const STOP_EVENTS: Record<TrackStopKey, readonly OrderEventKind[]> = {
  paid: ["payment_received"],
  purchased: ["purchased"],
  hub: ["hub_received"],
  in_the_air: ["departed", "arrived_country"],
  your_door: ["delivered", "out_for_delivery"],
};

// ── Derivation ──────────────────────────────────────────────────────────────

/**
 * Build the track. Total: never throws, and an unrecognised status produces an
 * untouched track rather than a guess.
 */
export function deriveJourneyTrack(input: TrackInput): JourneyTrack {
  const isCancelled = input.status === "cancelled";
  const events = [...input.events];

  // The furthest point anything can vouch for. An event can push the parcel
  // AHEAD of its status (a hub arrival logged while the order is still
  // `processing`) but never behind it — a status is an operator's deliberate act.
  let reached = STATUS_INDEX[input.status] ?? -1;
  for (const event of events) {
    const index = EVENT_INDEX[event.kind];
    if (index !== undefined && index > reached) reached = index;
  }
  if (isCancelled) reached = -1;

  const isComplete = input.status === "delivered" || input.status === "completed";

  const stops = STOP_ORDER.map((key, index) => {
    const event = latestEventFor(events, STOP_EVENTS[key]);
    const isFinal = key === "your_door";

    return {
      key,
      label: STOP_LABELS[key],
      state: stateFor(index, reached, isComplete, isCancelled),
      // `delivered_at` is the one pre-`order_events` timestamp worth honouring:
      // orders delivered before migration 050 have it and nothing else.
      at: event?.occurred_at ?? (isFinal ? (input.deliveredAt ?? null) : null),
      note: event ? noteFor(event) : null,
      etaFrom: isFinal ? (input.etaFrom ?? null) : null,
      etaTo: isFinal ? (input.etaTo ?? null) : null,
    } satisfies TrackStop;
  });

  return {
    stops,
    percent: percentFor(reached, isCancelled),
    isCancelled,
    isComplete,
    reachedHub: events.some((event) => event.kind === "hub_received"),
  };
}

/**
 * Everything behind the parcel is `done`, where it stands is `now`, the rest is
 * `up`. A delivered order has no `now` — the last stop is `done`, so the track
 * reads as finished rather than as "currently arriving".
 */
function stateFor(
  index: number,
  reached: number,
  isComplete: boolean,
  isCancelled: boolean,
): TrackStopState {
  if (isCancelled) return "up";
  if (index < reached) return "done";
  if (index === reached) return isComplete ? "done" : "now";
  return "up";
}

/**
 * 0 / 25 / 50 / 75 / 100 — the rail is divided by its four gaps, so the fill
 * always ends exactly on a dot. A parcel that has not been paid for fills
 * nothing: an empty rail is the honest picture of an unpaid order, and the
 * mock's 5% sliver would suggest work has started.
 */
function percentFor(reached: number, isCancelled: boolean): number {
  if (isCancelled || reached < 0) return 0;
  return Math.round((Math.min(reached, 4) / 4) * 100);
}

/** Newest matching event wins: a parcel can pass through two hubs. */
function latestEventFor(
  events: readonly TrackEvent[],
  kinds: readonly OrderEventKind[],
): TrackEvent | null {
  let best: TrackEvent | null = null;
  for (const kind of kinds) {
    for (const event of events) {
      if (event.kind !== kind) continue;
      if (!best || event.occurred_at > best.occurred_at) best = event;
    }
    // Most specific kind first: a `departed` row beats an `arrived_country` one
    // for the "In the air" stop even if the latter is newer.
    if (best) return best;
  }
  return best;
}

/**
 * "New York · 0.6 lb" — location, detail and received weight folded into the one
 * clause the mock prints after the date. Empty strings are dropped, so a row
 * with a blank `detail` does not render a stray separator.
 */
export function noteFor(event: TrackEvent): string | null {
  const parts = [
    event.location?.trim(),
    event.detail?.trim(),
    event.weight_lbs != null && event.weight_lbs > 0
      ? `${formatWeight(event.weight_lbs)} lb`
      : null,
  ].filter((part): part is string => !!part && part.length > 0);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Weights are printed as the operator entered them: 0.6, not 0.60 or 1. */
function formatWeight(lbs: number): string {
  return Number.isInteger(lbs) ? String(lbs) : String(Number(lbs.toFixed(2)));
}
