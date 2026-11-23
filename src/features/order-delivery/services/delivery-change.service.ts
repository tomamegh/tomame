import "server-only";

import { getDeliveryAddressById } from "@/db/queries/delivery-addresses";
import { listActiveDeliveryZones, type DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { getOrderGroupById, setPaidGroupWindowPref, updatePaidGroupDelivery, type OrderGroupRow } from "@/db/queries/order-groups";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { listOrdersByGroup } from "@/db/queries/orders";
import { displayPhone, isContactPhone } from "@/features/addresses/phone";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { deliverySnapshotOf } from "@/features/bag/delivery-snapshot";
import { isPickupEnabled } from "@/features/bag/services/delivery-settings.service";
import { firmPlansFor } from "@/features/journeys/services/firm-dates.service";
import { deliverToOf } from "@/features/journeys/services/journey-detail.service";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import { getOrder } from "@/features/orders/services/orders.service";
import type { PlatformUser } from "@/features/users/types";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import { deliveryDetailsChangedTemplate } from "@/lib/email/templates/delivery-details-changed";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { whatsappMessages } from "@/lib/whatsapp/templates";

import { deliveryLock, type DeliveryLock } from "../delivery-lock";
import { parseWindowSlots, slotText, type WindowSlot } from "../delivery-windows";

/**
 * A customer changes where a paid checkout is delivered, without messaging
 * anyone (Seamless Roadmap, Initiative 5): door ↔ pickup, another address, or
 * the same address after editing its phone. Only to a choice with the same
 * delivery fee they paid (the user's rule, 23 Nov 2026); anything else is a
 * conversation with the team. Locked at the cutoff of the flight it is booked
 * on, and once any item has left the US hub.
 */

export const DELIVERY_CHANGED_EVENT = "delivery_details_changed";

export interface DeliveryChangeView {
  orderGroupId: string;
  itemCount: number;
  /** What they paid for delivery; every choice offered costs the same. */
  feeGhs: number;
  /** `phone`: the number the rider calls (door only). */
  current: { kind: "door" | "pickup"; addressId: string | null; zoneId: string | null; phone: string | null };
  lock: DeliveryLock;
  /** Door zones a saved address may be in to be offered. */
  doorZoneIds: string[];
  /** Pickup points; one with a different fee is shown but sends them to the team. */
  pickupZones: Array<{ id: string; name: string; note: string | null; sameFee: boolean }>;
  /** Every active door zone, for adding an address. */
  doorZones: DeliveryZoneRow[];
  /** 125: the windows they may prefer, and the one they chose (a slot key) or null. */
  windowSlots: WindowSlot[];
  windowPref: string | null;
}

/** The admin's slots (125), or the defaults when the setting is missing. Never throws. */
export async function loadWindowSlots(): Promise<WindowSlot[]> {
  const settings = await getSiteSettingsMap().catch(() => ({}) as Record<string, unknown>);
  return parseWindowSlots((settings as Record<string, unknown>).delivery_window_slots);
}

export type DeliveryChangeInput = { delivery_address_id: string } | { delivery_zone_id: string };

const sameFee = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function lockFor(group: OrderGroupRow, now: Date): Promise<DeliveryLock> {
  const orders = await listOrdersByGroup(createAdminClient(), group.id);
  const plans = await firmPlansFor(orders.filter((o) => o.status !== "cancelled").map((o) => ({ id: o.id, status: o.status })));
  return deliveryLock({ groupStatus: group.status, orders, plans: [...plans.values()], now });
}

async function ownedGroup(user: PlatformUser, orderId: string): Promise<OrderGroupRow> {
  // Ownership is `getOrder`'s: another customer's order is a 404 here too.
  const order = await getOrder(await createClient(), user, orderId);
  const group = order.order_group_id ? await getOrderGroupById(order.order_group_id) : null;
  if (!group || group.user_id !== user.id) throw new APIError(404, "This order has no delivery to change.");
  return group;
}

function currentOf(group: OrderGroupRow): DeliveryChangeView["current"] {
  const kind = group.delivery_address?.kind === "pickup" ? "pickup" : "door";
  const phone = kind === "door" && typeof group.delivery_address?.phone === "string" ? group.delivery_address.phone : null;
  return { kind, addressId: kind === "door" ? group.delivery_address_id : null, zoneId: group.delivery_zone_id, phone };
}

/** The order page's "Change delivery" card. Null for an order with no checkout (a legacy single order). */
export async function getDeliveryChangeView(user: PlatformUser, orderId: string, now: Date = new Date()): Promise<DeliveryChangeView | null> {
  let group: OrderGroupRow;
  try {
    group = await ownedGroup(user, orderId);
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) return null;
    throw error;
  }
  if (group.status !== "paid") return null;
  const [lock, zones, pickupOn, windowSlots] = await Promise.all([lockFor(group, now), listActiveDeliveryZones(), isPickupEnabled(), loadWindowSlots()]);
  const fee = group.delivery_fee_ghs;
  return {
    orderGroupId: group.id,
    itemCount: group.item_count,
    feeGhs: fee,
    current: currentOf(group),
    lock,
    doorZoneIds: zones.filter((z) => z.kind === "door" && sameFee(z.fee_ghs, fee)).map((z) => z.id),
    pickupZones: pickupOn
      ? zones.filter((z) => z.kind === "pickup").map((z) => ({ id: z.id, name: z.name, note: z.note, sameFee: sameFee(z.fee_ghs, fee) }))
      : [],
    doorZones: zones.filter((z) => z.kind === "door"),
    windowSlots,
    windowPref: group.delivery_window_pref,
  };
}

/** 125: the customer's preferred delivery window for the checkout, under the same lock as the address. Null clears it. */
export async function setDeliveryWindowPref(
  user: PlatformUser,
  orderId: string,
  slotKey: string | null,
  now: Date = new Date(),
): Promise<{ changed: boolean; windowPref: string | null }> {
  const group = await ownedGroup(user, orderId);
  const lock = await lockFor(group, now);
  if (!lock.editable) throw new APIError(409, lock.reason);
  const slots = await loadWindowSlots();
  const slot = slotKey ? slots.find((s) => s.key === slotKey) : null;
  if (slotKey && !slot) throw new APIError(400, "That delivery window is not offered any more. Pick another.");
  if (group.delivery_window_pref === slotKey) return { changed: false, windowPref: slotKey };

  const updated = await setPaidGroupWindowPref(group.id, slotKey);
  if (!updated) throw new APIError(409, "This order can no longer be changed. Refresh the page.");
  await logAuditEvent({
    actorId: user.id,
    actorRole: AUDIT_ACTOR_ROLES.USER,
    action: "order_group_delivery_window_chosen",
    entityType: AUDIT_ENTITY_TYPES.ORDER_GROUP,
    entityId: group.id,
    metadata: { order_id: orderId, before: group.delivery_window_pref, after: slotKey },
  });
  const label = deliverToOf(updated.delivery_address)?.label ?? "your address";
  await tellCustomer(user.id, orderId, updated, label, lock, now, slot ? slotText(slot) : "no preference");
  return { changed: true, windowPref: slotKey };
}

export async function changeOrderDelivery(
  user: PlatformUser,
  orderId: string,
  input: DeliveryChangeInput,
  now: Date = new Date(),
): Promise<{ changed: boolean; deliverTo: ReturnType<typeof deliverToOf> }> {
  const group = await ownedGroup(user, orderId);
  const lock = await lockFor(group, now);
  if (!lock.editable) throw new APIError(409, lock.reason);

  const zones = await listActiveDeliveryZones();
  let snapshot: Record<string, unknown>;
  let addressId: string | null = null;
  let zone: DeliveryZoneRow | undefined;

  if ("delivery_address_id" in input) {
    const address = await getDeliveryAddressById(input.delivery_address_id);
    if (!address || address.user_id !== user.id) throw new APIError(404, "That address was not found.");
    zone = zones.find((z) => z.id === address.delivery_zone_id);
    if (!zone || zone.kind !== "door") throw new APIError(400, "That address has no delivery area yet. Edit it and pick one.");
    if (!isContactPhone(address.phone)) throw new APIError(400, "That address's phone number looks incomplete. Edit the address first.");
    addressId = address.id;
    snapshot = deliverySnapshotOf({ kind: "door", address, zone });
  } else {
    zone = zones.find((z) => z.id === input.delivery_zone_id && z.kind === "pickup");
    if (!zone || !(await isPickupEnabled())) throw new APIError(404, "That pickup point is not available.");
    snapshot = deliverySnapshotOf({ kind: "pickup", zone });
  }
  if (!sameFee(zone.fee_ghs, group.delivery_fee_ghs)) {
    throw new APIError(409, `Delivery to ${zone.name} costs a different amount from what you paid. Message us on WhatsApp and we will change it for you.`);
  }

  const before = deliverToOf(group.delivery_address);
  const after = deliverToOf(snapshot);
  if (JSON.stringify(group.delivery_address) === JSON.stringify(snapshot)) return { changed: false, deliverTo: before };

  const updated = await updatePaidGroupDelivery(group.id, { delivery_address: snapshot, delivery_address_id: addressId, delivery_zone_id: zone.id });
  if (!updated) throw new APIError(409, "This order can no longer be changed. Refresh the page.");

  await logAuditEvent({
    actorId: user.id,
    actorRole: AUDIT_ACTOR_ROLES.USER,
    action: "order_group_delivery_changed",
    entityType: AUDIT_ENTITY_TYPES.ORDER_GROUP,
    entityId: group.id,
    metadata: { order_id: orderId, before: group.delivery_address, after: snapshot, lock_until: lock.until },
  });
  await tellCustomer(user.id, orderId, updated, after?.label ?? zone.name, lock, now);
  return { changed: true, deliverTo: after };
}

async function tellCustomer(
  userId: string,
  orderId: string,
  group: OrderGroupRow,
  label: string,
  lock: DeliveryLock,
  now: Date,
  /** Set when what changed is the preferred window ("Afternoon, 12–3pm"). */
  windowChange?: string,
): Promise<void> {
  const orders = (await listOrdersByGroup(createAdminClient(), group.id)).filter((o) => o.status !== "cancelled");
  const first = orders.find((o) => o.id === orderId) ?? orders[0];
  if (!first) return;
  const what = orders.length === 1 ? `order ${first.order_no}` : `${orders.length} of your orders`;
  const until = lock.editable && lock.until ? lock.until : null;
  const phone = currentOf(group).phone;
  await notifyCustomer({
    userId,
    event: DELIVERY_CHANGED_EVENT,
    payload: {
      order_ids: orders.map((o) => o.id),
      order_no: first.order_no,
      order_count: orders.length,
      deliver_to: label,
      window: windowChange ?? null,
      until,
      href: `/app/orders/${first.id}`,
    },
    template: deliveryDetailsChangedTemplate({
      deliverTo: deliverToOf(group.delivery_address),
      phone: phone ? displayPhone(phone) : null,
      windowPref: windowChange ?? null,
      items: orders.map((o) => ({ orderNo: o.order_no, productName: o.product_name })),
      until,
      journeyUrl: `${env.app.url}/app/orders/${first.id}`,
    }),
    now,
    whatsapp: {
      message: whatsappMessages.shipmentUpdate({
        orderId: first.id,
        what,
        update: windowChange
          ? `Preferred delivery window: ${windowChange}`
          : `Delivery changed to ${label}${phone ? `; our rider will call ${displayPhone(phone)}` : ""}`,
      }),
      dedupeKey: `${DELIVERY_CHANGED_EVENT}:${group.id}:${group.updated_at}`,
    },
    source: "delivery-change",
  });
}
