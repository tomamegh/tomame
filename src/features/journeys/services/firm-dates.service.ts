import "server-only";

import { loadDeliveryPlanFacts } from "@/db/queries/delivery-plans";
import { insertFirmDates, latestFirmDates, type FirmDateReason, type FirmDateRow } from "@/db/queries/order-firm-dates";
import { logger } from "@/lib/logger";

import { deliveryPlanFor, type DeliveryPlan } from "../delivery-plan";

/**
 * Firm delivery dates (Seamless Roadmap, Initiative 2). The plan itself is
 * worked out on every read (`deliveryPlanFor`); this records the date each time
 * a message gives one, so the promise can be checked against the delivery.
 */

export type FirmPlan = Extract<DeliveryPlan, { kind: "firm" }>;

const CHUNK = 100;

/** The firm plan per order, for orders whose plan is firm. Status is the order's own. */
export async function firmPlansFor(orders: ReadonlyArray<{ id: string; status: string }>): Promise<Map<string, FirmPlan>> {
  const out = new Map<string, FirmPlan>();
  for (let i = 0; i < orders.length; i += CHUNK) {
    const slice = orders.slice(i, i + CHUNK);
    const facts = await loadDeliveryPlanFacts(slice.map((o) => o.id));
    for (const order of slice) {
      const plan = deliveryPlanFor({
        status: order.status,
        storeTracking: facts.storeTracking.get(order.id) ?? null,
        hubArrivedAt: facts.hubArrivedAt.get(order.id) ?? null,
        shippedOn: facts.shippedOn.get(order.id) ?? null,
        departures: facts.departures,
        estimate: null,
      });
      if (plan?.kind === "firm") out.set(order.id, plan);
    }
  }
  return out;
}

/** Same door date and same flight. */
export function samePlan(a: FirmPlan, b: FirmPlan): boolean {
  return a.deliveryOn === b.deliveryOn && a.flight.departsOn === b.flight.departsOn;
}

/**
 * Record the dates just given. An order whose latest record already says the
 * same thing gets no new row, so a second tracking number adds nothing. Never
 * throws: a lost record costs a metric, not the message.
 */
export async function recordFirmDates(plans: ReadonlyMap<string, FirmPlan>, reason: FirmDateReason): Promise<void> {
  if (plans.size === 0) return;
  try {
    const latest = await latestFirmDates([...plans.keys()]);
    const rows: FirmDateRow[] = [];
    for (const [orderId, plan] of plans) {
      const prev = latest.get(orderId);
      if (prev && prev.delivery_on === plan.deliveryOn && prev.flight_on === plan.flight.departsOn) continue;
      rows.push({ order_id: orderId, delivery_on: plan.deliveryOn, flight_on: plan.flight.departsOn, basis: plan.basis, reason });
    }
    await insertFirmDates(rows);
  } catch (error) {
    logger.warn("firm dates: could not record", { reason, error: error instanceof Error ? error.message : String(error) });
  }
}
