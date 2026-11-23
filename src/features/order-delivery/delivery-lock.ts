import type { DeliveryPlan } from "@/features/journeys/delivery-plan";

/**
 * Until when a customer may change where a paid checkout is delivered
 * (Seamless Roadmap, Initiative 5). Pure.
 *
 * The delivery details travel with the box: they can change until the box
 * closes for the flight the parcel is booked on (that flight's cutoff), and
 * never once any item has left our US hub. Before the store's tracking is in
 * there is no flight yet, so there is no deadline yet either.
 */

type FirmPlan = Extract<DeliveryPlan, { kind: "firm" }>;

export type DeliveryLock =
  | { editable: true; until: string | null; flightOn: string | null }
  | { editable: false; reason: string };

const LEFT_THE_HUB = "It has left our US hub, so the delivery details are with the team in Accra now.";

export function deliveryLock(input: {
  groupStatus: string;
  /** The checkout's orders, cancelled ones included. */
  orders: ReadonlyArray<{ status: string }>;
  /** The firm plan of each order that has one. */
  plans: readonly FirmPlan[];
  now: Date;
}): DeliveryLock {
  if (input.groupStatus !== "paid") return { editable: false, reason: "Only a paid order's delivery can be changed here." };
  const live = input.orders.filter((o) => o.status !== "cancelled");
  if (live.length === 0) return { editable: false, reason: "This order was cancelled." };
  if (live.some((o) => o.status !== "paid" && o.status !== "processing")) return { editable: false, reason: LEFT_THE_HUB };
  if (input.plans.some((p) => p.basis === "flown")) return { editable: false, reason: LEFT_THE_HUB };

  // The earliest flight any item is booked on closes the change for the whole checkout.
  const first = [...input.plans].sort((a, b) => a.flight.cutoffAt.localeCompare(b.flight.cutoffAt))[0];
  if (!first) return { editable: true, until: null, flightOn: null };
  if (Date.parse(first.flight.cutoffAt) <= input.now.getTime()) {
    return { editable: false, reason: "The box for its flight has closed, so the delivery details are fixed for this trip." };
  }
  return { editable: true, until: first.flight.cutoffAt, flightOn: first.flight.departsOn };
}
