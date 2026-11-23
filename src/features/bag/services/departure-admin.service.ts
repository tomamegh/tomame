import "server-only";

import { cancelDeparture, getDepartureById, moveDeparture, type FlightDepartureRow } from "@/db/queries/flight-departures";
import { listOrdersAwaitingDelivery, type AwaitingDeliveryOrder } from "@/db/queries/order-firm-dates";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { planDay } from "@/features/journeys/delivery-plan";
import { firmPlansFor, recordFirmDates, samePlan, type FirmPlan } from "@/features/journeys/services/firm-dates.service";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import { deliveryDateChangedTemplate } from "@/lib/email/templates/delivery-date-changed";
import { env } from "@/lib/env";
import { whatsappMessages } from "@/lib/whatsapp/templates";

/**
 * Ops moves or cancels a flight on the admin boxes screen (Seamless Roadmap,
 * Initiative 2). The boxes and packages follow it in the database (124); every
 * order whose firm door date changes because of it gets the new date recorded,
 * and each customer hears once, all their affected orders in one message.
 */

export const DELIVERY_DATE_CHANGED_EVENT = "delivery_date_changed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadDeparture(id: string): Promise<FlightDepartureRow> {
  const found = UUID.test(id) ? await getDepartureById(id) : null;
  if (!found) throw new APIError(404, "That flight was not found. Refresh the page.");
  return found;
}

export interface DepartureChangeResult {
  departure: FlightDepartureRow | null;
  /** Orders whose door date changed. */
  redated: number;
  /** Customers told. */
  notified: number;
}

export async function moveDepartureByStaff(
  adminId: string,
  id: string,
  input: { date: string; time: string },
  now: Date = new Date(),
): Promise<DepartureChangeResult> {
  const old = await loadDeparture(id);
  const departsAt = new Date(`${input.date}T${input.time}:00Z`);
  if (!Number.isFinite(departsAt.getTime())) throw new APIError(400, "Enter a real date and time.");
  if (departsAt.getTime() <= now.getTime()) throw new APIError(400, "The new departure has to be in the future.");
  // The cutoff keeps its distance from the flight.
  const gap = Date.parse(old.departs_at) - Date.parse(old.cutoff_at);
  const cutoffAt = new Date(departsAt.getTime() - Math.max(gap, 0));

  return changeDeparture(adminId, old, "moved", () => moveDeparture(id, departsAt.toISOString(), cutoffAt.toISOString()), now);
}

export async function cancelDepartureByStaff(adminId: string, id: string, now: Date = new Date()): Promise<DepartureChangeResult> {
  const old = await loadDeparture(id);
  return changeDeparture(adminId, old, "cancelled", () => cancelDeparture(id), now);
}

async function changeDeparture(
  adminId: string,
  old: FlightDepartureRow,
  change: "moved" | "cancelled",
  apply: () => Promise<string | null>,
  now: Date,
): Promise<DepartureChangeResult> {
  if (old.status !== "scheduled" && old.status !== "closed") {
    throw new APIError(409, "This flight has left or was cancelled. Refresh the page.");
  }
  const orders = await listOrdersAwaitingDelivery();
  const before = await firmPlansFor(orders);

  let nowId: string | null;
  try {
    nowId = await apply();
  } catch (error) {
    throw toApiError(error);
  }

  const after = await firmPlansFor(orders);
  const changed = new Map<string, FirmPlan>();
  for (const [orderId, was] of before) {
    const is = after.get(orderId);
    if (is && !samePlan(was, is)) changed.set(orderId, is);
  }
  await recordFirmDates(changed, change === "moved" ? "departure_moved" : "departure_cancelled");

  const byCustomer = new Map<string, Array<{ order: AwaitingDeliveryOrder; plan: FirmPlan }>>();
  for (const order of orders) {
    const plan = changed.get(order.id);
    if (plan) byCustomer.set(order.user_id, [...(byCustomer.get(order.user_id) ?? []), { order, plan }]);
  }
  for (const rows of byCustomer.values()) await tellCustomer(rows, change, now);

  const departure = nowId ? await getDepartureById(nowId) : null;
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: change === "moved" ? "flight_departure_moved" : "flight_departure_cancelled",
    entityType: AUDIT_ENTITY_TYPES.FLIGHT_DEPARTURE,
    entityId: old.id,
    metadata: {
      from: { departs_at: old.departs_at, cutoff_at: old.cutoff_at },
      to: departure ? { id: departure.id, departs_at: departure.departs_at, cutoff_at: departure.cutoff_at } : null,
      redated_orders: [...changed.keys()],
      customers_told: byCustomer.size,
    },
  });
  return { departure, redated: changed.size, notified: byCustomer.size };
}

function toApiError(error: unknown): APIError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("day_taken")) {
    return new APIError(409, "There is already a flight that day. Cancel this one instead: its boxes move to the next flight.");
  }
  if (message.includes("departure_not_movable")) return new APIError(409, "This flight has left or was cancelled. Refresh the page.");
  if (message.includes("departure_not_found")) return new APIError(404, "That flight was not found. Refresh the page.");
  return new APIError(500, "Could not change the flight. Try again.");
}

async function tellCustomer(
  rows: Array<{ order: AwaitingDeliveryOrder; plan: FirmPlan }>,
  change: "moved" | "cancelled",
  now: Date,
): Promise<void> {
  const first = rows[0]!;
  const flight = `${first.plan.flight.carrier} ${first.plan.flight.origin} → Accra, ${planDay(first.plan.flight.departsOn)}`;
  const what = rows.length === 1 ? `order ${first.order.order_no}` : `${rows.length} of your orders`;
  const latest = rows.map((r) => r.plan.deliveryOn).sort().at(-1)!;
  const ids = rows.map((r) => r.order.id).sort();
  await notifyCustomer({
    userId: first.order.user_id,
    event: DELIVERY_DATE_CHANGED_EVENT,
    payload: {
      order_ids: ids,
      order_no: first.order.order_no,
      order_count: rows.length,
      change,
      delivery_on: latest,
      flight_on: first.plan.flight.departsOn,
      href: `/app/orders/${first.order.id}`,
    },
    template: deliveryDateChangedTemplate({
      change,
      flight,
      items: rows.map((r) => ({ orderNo: r.order.order_no, productName: r.order.product_name, deliveryOn: planDay(r.plan.deliveryOn) })),
      journeyUrl: `${env.app.url}/app/orders/${first.order.id}`,
    }),
    now,
    whatsapp: {
      message: whatsappMessages.shipmentUpdate({
        orderId: first.order.id,
        what,
        update: `New delivery date: by ${planDay(latest)}. ${change === "cancelled" ? "The flight was cancelled; now on" : "The flight moved to"} ${planDay(first.plan.flight.departsOn)}`,
      }),
      dedupeKey: `${DELIVERY_DATE_CHANGED_EVENT}:${ids.join(",")}:${latest}`,
    },
    source: "flight-departure-change",
  });
}
