import { ACCRA_DAYS_AFTER_FLIGHT, HUB_TRANSIT_DAYS, USUAL_DELIVERY_RANGE } from "@/config/delivery-schedule";

/**
 * The delivery promise, in two stages (site brief Fix 6). Pure.
 *
 * - `estimate`: no store tracking yet. Only the usual range, and why: the item
 *   flies on the next Wednesday or Friday Delta Cargo flight after it reaches
 *   the US hub, and nothing can be firm before the store has shipped it.
 * - `firm`: the store's tracking is in. The flight is the first departure
 *   whose cutoff falls after the hub arrival (the real one once the parcel is
 *   in, else the expected one), or the flight the package actually took; the
 *   door date follows from it. Recomputed on every read, so it updates itself
 *   when the parcel lands at the hub or a flight moves.
 */

export interface PlanDeparture {
  carrier: string;
  origin: string;
  destination: string;
  departs_on: string;
  departs_at: string;
  cutoff_at: string;
}

export interface DeliveryPlanInput {
  status: string;
  /** The store's tracking for this order: when it was registered, and when the parcel reached the hub (if it has). */
  storeTracking: { registeredAt: string; arrivedAt: string | null } | null;
  /** When the parcel was logged in at the US hub (`hub_received`), with or without store tracking. */
  hubArrivedAt?: string | null;
  /** The departure the order's package flew on (113), once it has shipped. */
  shippedOn: PlanDeparture | null;
  /** Upcoming departures, soonest first (any status still taking or carrying boxes). */
  departures: readonly PlanDeparture[];
  /** The quote's forecast window, for the estimate stage. */
  estimate: { from: string | null; to: string | null } | null;
}

export type DeliveryPlan =
  | { kind: "estimate"; range: string; from: string | null; to: string | null; explanation: string }
  | {
      kind: "firm";
      flight: { carrier: string; origin: string; destination: string; departsOn: string };
      deliveryOn: string;
      /** What the flight was worked out from. */
      basis: "flown" | "hub_arrival" | "expected_hub_arrival";
    };

const EXPLANATION =
  "It flies on the next Wednesday or Friday Delta Cargo flight from New York to Accra after it reaches our US hub. We give you a firm date as soon as the store sends its tracking.";

const DONE = new Set(["delivered", "completed", "cancelled", "pending"]);

export function deliveryPlanFor(input: DeliveryPlanInput): DeliveryPlan | null {
  if (DONE.has(input.status)) return null;

  if (input.shippedOn) return firm(input.shippedOn, "flown");
  // In the air with no flight on record (moved on from the admin console): promise nothing rather than a later flight.
  if (input.status === "in_transit") return null;

  if (input.storeTracking || input.hubArrivedAt) {
    const arrived = input.storeTracking?.arrivedAt ?? input.hubArrivedAt ?? null;
    const hub = arrived ? Date.parse(arrived) : Date.parse(input.storeTracking!.registeredAt) + HUB_TRANSIT_DAYS * 86_400_000;
    const flight = Number.isFinite(hub) ? input.departures.find((d) => Date.parse(d.cutoff_at) > hub) : undefined;
    if (flight) return firm(flight, arrived ? "hub_arrival" : "expected_hub_arrival");
  }

  return {
    kind: "estimate",
    range: USUAL_DELIVERY_RANGE,
    from: input.estimate?.from ?? null,
    to: input.estimate?.to ?? null,
    explanation: EXPLANATION,
  };
}

function firm(d: PlanDeparture, basis: "flown" | "hub_arrival" | "expected_hub_arrival"): DeliveryPlan {
  return {
    kind: "firm",
    flight: { carrier: d.carrier, origin: d.origin, destination: d.destination, departsOn: d.departs_on },
    deliveryOn: addDays(d.departs_on, ACCRA_DAYS_AFTER_FLIGHT),
    basis,
  };
}

function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Fri 28 Nov" — a departure or door date, read in Accra (UTC). */
export function planDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** The one-line promise every screen prints. */
export function describePlan(plan: DeliveryPlan, now: Date = new Date()): { label: string; line: string; detail: string | null } {
  if (plan.kind === "estimate") {
    return { label: "Estimated delivery", line: plan.range.charAt(0).toUpperCase() + plan.range.slice(1), detail: plan.explanation };
  }
  const flight = `${plan.flight.carrier} ${plan.flight.origin} → Accra, ${planDay(plan.flight.departsOn)}`;
  // Flown and past its usual door date: never a "By" date that has already gone.
  if (plan.basis === "flown" && plan.deliveryOn < now.toISOString().slice(0, 10)) {
    return { label: "At your door", line: "Any day now", detail: `Flew on ${flight}; it is clearing in Accra.` };
  }
  return {
    label: "At your door",
    line: `By ${planDay(plan.deliveryOn)}`,
    detail:
      plan.basis === "flown"
        ? `Flew on ${flight}.`
        : plan.basis === "hub_arrival"
          ? `At our US hub; booked on ${flight}.`
          : `The store has shipped it; booked on ${flight}, once it reaches our US hub.`,
  };
}
