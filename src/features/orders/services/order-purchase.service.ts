import "server-only";

import { APIError } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackingInputProblem } from "@/features/warehouse/inbound/tracking-number";
import { registerInboundTracking } from "@/features/warehouse/services/inbound.service";
import type { InboundParcel } from "@/features/warehouse/types";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "../types";
import { getOrderById, updateOrderStatusAdmin } from "./orders.service";
import { recordStorePaidPrice } from "@/db/queries/order-store-price";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";

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
  /** 103 (A0b): what the store charged per item, before tax and shipping. */
  store_paid_price?: number;
  store_paid_currency?: string;
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
    const problem = trackingInputProblem(entry.tracking_number);
    if (problem) throw new APIError(400, problem);
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

  // Recorded after the move, so a refused transition leaves no price behind.
  if (input.store_paid_price != null && input.store_paid_price > 0) {
    await recordStorePrice(user, order, input.store_paid_price, input.store_paid_currency);
  }
  return { order: updated, parcels };
}

/**
 * The store's charged price beside what we quoted (A0b), audited as
 * `order_store_price_recorded` with the drift, so "is the scraper right?" is a
 * number per store and tier in daily health.
 */
async function recordStorePrice(user: PlatformUser, order: Order, price: number, currency: string | undefined): Promise<void> {
  const quoted = order.extraction_metadata?.product?.price ?? null;
  const quotedCurrency = order.extraction_metadata?.product?.currency ?? "USD";
  const paidCurrency = (currency ?? quotedCurrency).toUpperCase();
  await recordStorePaidPrice({ orderId: order.id, price, currency: paidCurrency, by: user.id });
  const drift = quoted != null && quoted > 0 && paidCurrency === quotedCurrency.toUpperCase() ? Math.round(((price - quoted) / quoted) * 1000) / 1000 : null;
  await logAuditEvent({
    actorId: user.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "order_store_price_recorded",
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: order.id,
    metadata: {
      store_paid_price: price,
      store_paid_currency: paidCurrency,
      quoted_price: quoted,
      quoted_currency: quotedCurrency,
      drift,
      platform: order.extraction_metadata?.platform ?? null,
      price_source: order.extraction_metadata?.price_source ?? order.extraction_metadata?.source ?? null,
    },
  });
}

export interface PurchaseManyInput {
  store_tracking?: PurchaseInput["store_tracking"];
  share_store_tracking?: boolean;
  /** Per order, optional: what the store charged per item. */
  store_paid_prices?: Record<string, number>;
  store_paid_currency?: string;
}

export interface PurchaseManyResult {
  purchased: Order[];
  /** Orders that could not move, each with the reason, so the screen names them. */
  refused: Array<{ order_id: string; reason: string }>;
}

/**
 * Several orders of one checkout bought in one store order. Each goes through
 * `markOrderPurchased` on its own (state check, audit, customer email), so one
 * order on hold or already moved is refused alone and the rest still go. The
 * same tracking on each order links them all to one expected parcel at the hub.
 */
export async function markOrdersPurchased(user: PlatformUser, orderIds: readonly string[], input: PurchaseManyInput): Promise<PurchaseManyResult> {
  const purchased: Order[] = [];
  const refused: PurchaseManyResult["refused"] = [];
  for (const orderId of [...new Set(orderIds)]) {
    try {
      const { order } = await markOrderPurchased(user, orderId, {
        store_tracking: input.store_tracking,
        share_store_tracking: input.share_store_tracking,
        store_paid_price: input.store_paid_prices?.[orderId],
        store_paid_currency: input.store_paid_currency,
      });
      purchased.push(order);
    } catch (error) {
      refused.push({ order_id: orderId, reason: error instanceof Error ? error.message : "Could not move this order" });
    }
  }
  return { purchased, refused };
}
