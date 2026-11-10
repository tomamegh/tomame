import "server-only";

import {
  countDeliveryPhotosSince,
  listAssignedDeliveryRows,
  listDeliveredBy,
  listDeliveryRows,
  listDriverProfiles,
  markDeliveredBy,
  setCodeFailures,
} from "@/db/queries/driver-deliveries";
import { getProfileNames, listWarehouseOrders } from "@/db/queries/warehouse";
import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { uploadOrderPhotos } from "@/features/order-photos/services/order-photos.service";
import { normaliseGhanaPhone } from "@/features/order-delivery/schema";
import { deliverOrderAsDriver } from "@/features/orders/services/orders.service";
import { notifyShipmentUpdate } from "@/features/shipments/shipment-notify.service";
import { loadStageSettings } from "@/features/shipments/stage-settings.service";
import type { PlatformUser } from "@/features/users/types";
import { hydrateItems } from "@/features/warehouse/services/warehouse.service";
import { canAccessAdmin, canAccessDeliveries, isDriver } from "@/lib/auth/admin-access";
import { requireWarehouse } from "@/lib/auth/guards";
import { APIError } from "@/lib/auth/api-helpers";

import { MAX_CODE_FAILURES, codesMatch, normaliseCodeInput } from "../delivery-code";
import type { DriverBoard, DriverDrop } from "../types";

/**
 * The driver app (102): the deliveries assigned to a driver, the hand-over
 * photo, and "delivered", which needs the customer's code.
 *
 * A driver sees only their own stops. Staff (operators and admins) see every
 * driver's, and may complete one with the code too, for a driver whose phone
 * died at the door. Nobody here ever reads a code back out.
 */

function actorRoleOf(user: PlatformUser): "driver" | "admin" | "warehouse" {
  return isDriver(user) ? "driver" : canAccessAdmin(user) ? "admin" : "warehouse";
}

function requireDeliveries(user: PlatformUser): void {
  if (!canAccessDeliveries(user)) throw new APIError(403, "Delivery access required");
}

/** Drivers staff can pick on "Out for delivery". Only those with a number customers can call. */
export async function listDriversForStaff(
  user: PlatformUser,
): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  requireWarehouse(user);
  return (await listDriverProfiles()).map((d) => ({
    id: d.id,
    name: [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || "Driver",
    phone: d.phone ? normaliseGhanaPhone(d.phone) : null,
  }));
}

export async function getDriverBoard(user: PlatformUser): Promise<DriverBoard> {
  requireDeliveries(user);
  const driverOnly = isDriver(user);
  const rows = await listAssignedDeliveryRows(driverOnly ? user.id : null);
  const orders = (await listWarehouseOrders({ ids: rows.map((r) => r.order_id), limit: rows.length || 1 })).filter(
    (o) => o.status === "in_transit",
  );
  const rowByOrder = new Map(rows.map((r) => [r.order_id, r]));
  const items = await hydrateItems(orders);
  const earliest = rows.reduce<string | null>(
    (min, r) => (r.driver_assigned_at && (!min || r.driver_assigned_at < min) ? r.driver_assigned_at : min),
    null,
  );
  const [photos, names] = await Promise.all([
    countDeliveryPhotosSince(items.map((i) => i.order_id), earliest ?? new Date(0).toISOString()),
    driverOnly ? Promise.resolve(new Map<string, string>()) : getProfileNames([...new Set(rows.map((r) => r.driver_id!).filter(Boolean))]),
  ]);

  const drops = new Map<string, DriverDrop>();
  for (const item of items) {
    const row = rowByOrder.get(item.order_id);
    const key = `${row?.driver_id ?? "-"}:${item.customer_key}`;
    const drop =
      drops.get(key) ??
      ({
        key,
        recipient: item.recipient,
        parcels: [],
        photo_count: 0,
        locked: false,
        assigned_at: row?.driver_assigned_at ?? null,
        // Staff see whose stop it is; a driver is looking at their own.
        driver_name: !driverOnly && row?.driver_id ? names.get(row.driver_id) ?? "Driver" : null,
      } satisfies DriverDrop);
    drop.parcels.push({
      order_id: item.order_id,
      order_no: item.order_no,
      title: item.title,
      image_url: item.image_url,
      quantity: item.quantity,
      special_instructions: item.special_instructions,
    });
    drop.photo_count += photos.get(item.order_id) ?? 0;
    drop.locked ||= (row?.delivery_code_failures ?? 0) >= MAX_CODE_FAILURES;
    drops.set(key, drop);
  }

  let doneToday: DriverBoard["done_today"] = [];
  if (driverOnly) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0); // Accra is GMT all year.
    const ids = await listDeliveredBy(user.id, startOfDay.toISOString());
    const done = ids.length ? await hydrateItems(await listWarehouseOrders({ ids, limit: ids.length })) : [];
    doneToday = done.map((i) => ({ order_id: i.order_id, order_no: i.order_no, title: i.title, recipient_name: i.recipient.name }));
  }

  return { drops: [...drops.values()], done_today: doneToday, is_staff: !driverOnly };
}

/** The hand-over photo, on the order the driver is delivering. */
export async function uploadDeliveryPhotos(user: PlatformUser, orderId: string, files: Buffer[]): Promise<number> {
  requireDeliveries(user);
  await assertAssigned(user, [orderId]);
  const stored = await uploadOrderPhotos(
    { id: user.id, email: user.email ?? null, role: actorRoleOf(user) },
    { orderId, files, kind: "delivered", caption: "Delivered", isCustomerVisible: true, notify: false },
  );
  return stored.length;
}

export interface CompleteResult {
  delivered: number;
}

/**
 * The customer read the code out; the driver typed it. Every parcel in the stop
 * is delivered together, the customer gets one "delivered" message, and the box
 * each came in closes when it empties. A wrong code counts against the stop and
 * five lock it.
 */
export async function completeDelivery(
  user: PlatformUser,
  input: { order_ids: string[]; code: string },
): Promise<CompleteResult> {
  requireDeliveries(user);
  const ids = [...new Set(input.order_ids)];
  const code = normaliseCodeInput(input.code);
  if (!code) throw new APIError(400, "The code is six digits. Ask the customer to read it from their Tomame app.");

  const rows = await assertAssigned(user, ids);
  const orders = await listWarehouseOrders({ ids, limit: ids.length });
  const open = orders.filter((o) => o.status === "in_transit");
  if (open.length === 0) return { delivered: 0 };
  if (new Set(open.map((o) => o.user_id)).size > 1) {
    throw new APIError(400, "These parcels are for different customers. Deliver each stop on its own.");
  }
  const openRows = rows.filter((r) => open.some((o) => o.id === r.order_id));
  if (openRows.some((r) => r.delivery_code_failures >= MAX_CODE_FAILURES)) {
    throw new APIError(423, "Too many wrong codes. Call the office so they can confirm this delivery.");
  }

  const since = openRows.reduce<string>(
    (min, r) => (r.driver_assigned_at && r.driver_assigned_at < min ? r.driver_assigned_at : min),
    new Date().toISOString(),
  );
  const photos = await countDeliveryPhotosSince(open.map((o) => o.id), since);
  if ([...photos.values()].reduce((a, b) => a + b, 0) === 0) {
    throw new APIError(409, "Take a photo of the hand-over first.");
  }

  const expected = new Set(openRows.map((r) => r.delivery_code));
  if (expected.has(null)) throw new APIError(409, "This customer has no delivery code yet. Call the office.");
  if (expected.size > 1) throw new APIError(409, "These parcels have different codes. Deliver them one at a time.");
  const [want] = [...expected] as string[];

  if (!codesMatch(want!, code)) {
    const worst = Math.max(...openRows.map((r) => r.delivery_code_failures)) + 1;
    for (const row of openRows) {
      await setCodeFailures(row.order_id, row.delivery_code_failures + 1);
      await logAuditEvent({
        actorId: user.id,
        actorRole: actorRoleOf(user),
        action: "delivery_code_failed",
        entityType: AUDIT_ENTITY_TYPES.ORDER,
        entityId: row.order_id,
        metadata: { attempt: row.delivery_code_failures + 1 },
      });
    }
    const left = Math.max(0, MAX_CODE_FAILURES - worst);
    throw new APIError(
      400,
      left > 0
        ? `That code doesn't match. Ask the customer to read it from their Tomame app. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "That code doesn't match, and this stop is now locked. Call the office.",
    );
  }

  const delivered: typeof open = [];
  for (const order of open) {
    await deliverOrderAsDriver(user, order.id, { notifyCustomer: false });
    delivered.push(order);
  }
  await markDeliveredBy(delivered.map((o) => o.id), user.id, true);
  for (const order of delivered) {
    await logAuditEvent({
      actorId: user.id,
      actorRole: actorRoleOf(user),
      action: "order_delivered_with_code",
      entityType: AUDIT_ENTITY_TYPES.ORDER,
      entityId: order.id,
      metadata: { order_no: order.order_no },
    });
  }

  const setting = (await loadStageSettings()).delivered;
  await notifyShipmentUpdate({
    kind: "stage",
    userId: delivered[0]!.user_id,
    stageKey: "delivered",
    stageTitle: setting.title,
    description: setting.description,
    message: null,
    expectedOn: null,
    orders: delivered.map((o) => ({ id: o.id, orderNo: o.order_no, productName: o.product_name?.trim() || "your item" })),
    contact: null,
    orderStatus: "delivered",
  });

  return { delivered: delivered.length };
}

/** A driver may only touch their own stops; staff may touch any assigned one. */
async function assertAssigned(user: PlatformUser, orderIds: string[]) {
  if (orderIds.length === 0) throw new APIError(400, "Choose a parcel.");
  const rows = await listDeliveryRows(orderIds);
  const mine = isDriver(user) ? rows.filter((r) => r.driver_id === user.id) : rows.filter((r) => r.driver_id);
  if (mine.length !== orderIds.length) throw new APIError(404, "That delivery is not on your list.");
  return mine;
}
