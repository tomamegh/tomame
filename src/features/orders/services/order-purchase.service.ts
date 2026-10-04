import "server-only";

import { APIError } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseTracking } from "@/features/warehouse/inbound/tracking-number";
import { registerInboundTracking } from "@/features/warehouse/services/inbound.service";
import type { InboundParcel } from "@/features/warehouse/types";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "../types";
import { getOrderById, updateOrderStatusAdmin } from "./orders.service";

/**
 * "Mark as purchased": the admin has bought the item from the store.
 *
 * One action, three effects, in this order:
 *  1. each store tracking number the admin pasted becomes an EXPECTED inbound
 *     parcel linked to the order (`registerInboundTracking`, 086), so the hub's
 *     scan finds the order when the box lands;
 *  2. the order moves `paid → processing` through the normal state machine —
 *     audit row, staff alert, journey event, customer WhatsApp and email;
 *  3. the email carries the store tracking only when the admin ticked
 *     "include it": by default customers see Tomame's number alone (086).
 *
 * Lives outside orders.service because it reaches into the warehouse, and the
 * warehouse already imports orders.service; this keeps that one-directional.
 */

export interface PurchaseInput {
  store_tracking?: Array<{ tracking_number: string; store_order_ref?: string | null }>;
  share_store_tracking?: boolean;
}

export interface PurchaseResult {
  order: Order;
  parcels: InboundParcel[];
}

export async function markOrderPurchased(user: PlatformUser, orderId: string, input: PurchaseInput): Promise<PurchaseResult> {
  const entries = (input.store_tracking ?? []).filter((t) => t.tracking_number.trim());

  // Everything that can refuse is checked BEFORE any parcel is written, so a
  // bad number or an order in the wrong state leaves nothing half done.
  for (const entry of entries) {
    if (!normaliseTracking(entry.tracking_number)) {
      throw new APIError(400, `“${entry.tracking_number.trim()}” does not look like a tracking number.`);
    }
  }
  const order = await getOrderById(createAdminClient(), orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.held_at) {
    throw new APIError(409, `This order is on hold and cannot be moved: ${order.hold_reason ?? "no reason recorded"}`);
  }
  if (order.status !== "paid") {
    throw new APIError(400, `Only a paid order can be marked purchased. This one is ${order.status}.`);
  }

  const parcels: InboundParcel[] = [];
  for (const entry of entries) {
    parcels.push(
      await registerInboundTracking(user, {
        order_id: orderId,
        tracking_number: entry.tracking_number,
        store_order_ref: entry.store_order_ref ?? undefined,
      }),
    );
  }

  const share = input.share_store_tracking === true && parcels.length > 0;
  const updated = await updateOrderStatusAdmin(createAdminClient(), user, orderId, "processing", undefined, {
    ...(share && {
      customerStoreTracking: parcels.map((p) => ({ carrier: p.carrier_label, number: p.tracking_display })),
    }),
  });
  return { order: updated, parcels };
}
