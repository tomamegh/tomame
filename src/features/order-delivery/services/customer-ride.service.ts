import "server-only";

import {
  getGhanaWarehouseAddress,
  getRideOrder,
  getRideRequest,
  listOpenRideRequests,
  saveRideRequest,
  type RideRequestRow,
} from "@/db/queries/customer-rides";
import { listOrderEvents } from "@/db/queries/order-events";
import { getShippedPackageForOrder } from "@/db/queries/warehouse";
import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import { currentStageKey } from "@/features/shipments/stages";
import { notifyStaff } from "@/features/staff-alerts/notify";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";
import { requireWarehouse, warehouseActorRole } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  canSendOwnRide,
  type CustomerRideInput,
  type CustomerRideRequest,
  type CustomerRideView,
  type PickupAddress,
} from "../customer-ride";
import { formatGhanaPhone, maskPhone } from "../schema";
import type { CourierDispatchResult } from "../types";
import { handOverToRider } from "./courier.service";

/**
 * The customer sends their own ride to the Accra warehouse (101).
 *
 * Delivery stays free; this is the customer's choice and their ride. They tell
 * us who is coming and roughly when, the warehouse is alerted, and when the
 * rider arrives staff hand the parcel over from the shipments board. The
 * hand-over is the ordinary rider hand-off (075), marked as the customer's.
 */

// ── Customer ────────────────────────────────────────────────────────────────

export async function requestCustomerRide(
  user: PlatformUser,
  orderId: string,
  input: CustomerRideInput,
): Promise<CustomerRideView> {
  const { order, ride } = await ownedOrder(user, orderId);
  const stage = currentStageKey(order.status, await listOrderEvents(createAdminClient(), orderId));
  if (!canSendOwnRide({ status: order.status, held: !!order.held_at, stage, courierDispatched: !!ride?.courier_dispatched_at })) {
    throw new APIError(
      409,
      ride?.courier_dispatched_at
        ? "A rider already has this parcel."
        : "You can send a rider once your parcel is at our Accra warehouse.",
    );
  }

  const requestedAt = new Date().toISOString();
  const isChange = !!ride?.ride_requested_at;
  await saveRideRequest(orderId, order.user_id, {
    requestedAt,
    riderName: input.rider.courier_name,
    riderPhone: input.rider.courier_phone,
    trackingUrl: input.rider.tracking_url,
    provider: input.rider.provider,
    eta: input.eta,
    note: input.note,
  });

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: isChange ? "customer_ride_updated" : "customer_ride_requested",
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: orderId,
    metadata: {
      rider_name: input.rider.courier_name,
      rider_phone: maskPhone(input.rider.courier_phone),
      provider: input.rider.provider,
      eta: input.eta,
    },
  });
  await recordOrderEvent({
    order_id: orderId,
    order_group_id: order.order_group_id,
    kind: "note",
    title: isChange ? "You changed your rider's details" : "You're sending your own rider",
    detail: [input.rider.courier_name, input.rider.courier_phone ? formatGhanaPhone(input.rider.courier_phone) : null]
      .filter(Boolean)
      .join(" · ") || null,
    created_by: user.id,
  });
  notifyStaff({ kind: "customer_ride", orderId, action: "requested", at: requestedAt });

  return getCustomerRideView(user, orderId);
}

/** Back to the free delivery. */
export async function cancelCustomerRide(user: PlatformUser, orderId: string): Promise<CustomerRideView> {
  const { order, ride } = await ownedOrder(user, orderId);
  if (!ride?.ride_requested_at) return getCustomerRideView(user, orderId);
  if (ride.courier_dispatched_at) throw new APIError(409, "Your rider already has the parcel.");

  await saveRideRequest(orderId, order.user_id, null);
  const at = new Date().toISOString();
  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "customer_ride_cancelled",
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: orderId,
    metadata: {},
  });
  await recordOrderEvent({
    order_id: orderId,
    order_group_id: order.order_group_id,
    kind: "note",
    title: "You called off your rider. We'll deliver it for free",
    created_by: user.id,
  });
  notifyStaff({ kind: "customer_ride", orderId, action: "cancelled", at });

  return getCustomerRideView(user, orderId);
}

/** What the order page draws. Null for anything not on its way. Never throws. */
export async function getCustomerRideView(
  user: PlatformUser,
  orderId: string,
  known?: { status: string; held: boolean; stage: ReturnType<typeof currentStageKey> },
): Promise<CustomerRideView> {
  const ride = await getRideRequest(orderId).catch(() => null);
  if (ride && ride.user_id !== user.id) return { eligible: false, request: null, pickup: null };
  let context = known;
  if (!context) {
    const order = await getRideOrder(orderId);
    const events = order ? await listOrderEvents(createAdminClient(), orderId) : [];
    context = order
      ? { status: order.status, held: !!order.held_at, stage: currentStageKey(order.status, events) }
      : { status: "unknown", held: false, stage: null };
  }

  const eligible = canSendOwnRide({
    status: context.status,
    held: context.held,
    stage: context.stage,
    courierDispatched: !!ride?.courier_dispatched_at,
  });
  const request = ride && !ride.courier_dispatched_at ? toRequest(ride) : null;
  const pickup = eligible || request ? await loadPickupAddress() : null;
  return { eligible, request, pickup };
}

// ── Warehouse ───────────────────────────────────────────────────────────────

export interface OpenRide extends CustomerRideRequest {
  orderId: string;
}

export async function listOpenCustomerRides(user: PlatformUser): Promise<OpenRide[]> {
  requireWarehouse(user);
  return (await listOpenRideRequests()).flatMap((row) => {
    const request = toRequest(row);
    return request ? [{ ...request, orderId: row.order_id }] : [];
  });
}

/** The customer's rider is at the door: give them the parcel. */
export async function handOverCustomerRide(user: PlatformUser, orderId: string): Promise<CourierDispatchResult> {
  requireWarehouse(user);
  const ride = await getRideRequest(orderId);
  if (!ride?.ride_requested_at) throw new APIError(404, "This customer is not sending a rider.");
  if (ride.courier_dispatched_at) throw new APIError(409, "This parcel has already been handed over.");
  const pkg = await getShippedPackageForOrder(orderId).catch(() => null);
  return handOverToRider(
    { actorId: user.id, actorRole: warehouseActorRole(user) },
    orderId,
    {
      courier_name: ride.ride_rider_name,
      courier_phone: ride.ride_rider_phone,
      tracking_url: ride.ride_tracking_url,
      provider: ride.ride_provider,
    },
    { arrangedBy: "customer", title: "Handed to your rider", packageId: pkg?.pkg.id ?? null },
  );
}

// ── Internals ───────────────────────────────────────────────────────────────

async function ownedOrder(user: PlatformUser, orderId: string) {
  const order = await getRideOrder(orderId);
  if (!order || order.user_id !== user.id) throw new APIError(404, "Order not found");
  return { order, ride: await getRideRequest(orderId) };
}

function toRequest(row: RideRequestRow): CustomerRideRequest | null {
  if (!row.ride_requested_at) return null;
  return {
    riderName: row.ride_rider_name,
    riderPhone: row.ride_rider_phone,
    trackingUrl: row.ride_tracking_url,
    provider: row.ride_provider,
    eta: row.ride_eta,
    note: row.ride_note,
    requestedAt: row.ride_requested_at,
  };
}

async function loadPickupAddress(): Promise<PickupAddress | null> {
  const raw = await getGhanaWarehouseAddress();
  if (!raw) return null;
  const text = (key: string) => {
    const v = raw[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const maps = text("maps_url");
  return {
    name: text("name") ?? "Tomame Accra warehouse",
    line1: text("line1"),
    area: text("area"),
    city: text("city"),
    digital_address: text("digital_address"),
    phone: text("phone"),
    hours: text("hours"),
    maps_url: maps && /^https:\/\//i.test(maps) ? maps : null,
  };
}
