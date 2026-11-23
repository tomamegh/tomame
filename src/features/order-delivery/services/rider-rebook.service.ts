import "server-only";

import { getCourierOrder, getOwnedOrderCourier, setCourierRebook } from "@/db/queries/order-courier";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import { notifyStaff } from "@/features/staff-alerts/notify";
import type { PlatformUser } from "@/features/users/types";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import { renderEmail, eyebrow, heading, paragraph, button, escapeHtml } from "@/lib/email/templates/layout";
import { env } from "@/lib/env";
import { whatsappMessages } from "@/lib/whatsapp/templates";

import { nextWindows, windowText } from "../delivery-windows";
import { loadWindowSlots } from "./delivery-change.service";

/**
 * Missed the rider? Rebook in one tap (Seamless Roadmap, Initiative 5). While
 * an order is out for delivery its customer may pick the next window; staff
 * are alerted and send it out again, which clears the request.
 */

export const DELIVERY_REBOOKED_EVENT = "delivery_rebooked";

export interface RebookView {
  options: Array<{ start: string; end: string; label: string }>;
  rebooked: { start: string; end: string; label: string } | null;
}

/** What the rider card offers. Null when the order is not out for delivery with a rider. */
export async function getRebookView(userId: string, orderId: string, orderStatus: string, now: Date = new Date()): Promise<RebookView | null> {
  if (orderStatus !== "in_transit") return null;
  const courier = await getOwnedOrderCourier(userId, orderId);
  if (!courier) return null;
  const options = nextWindows(await loadWindowSlots(), now);
  const rebooked = courier.rebook ? { start: courier.rebook.start, end: courier.rebook.end, label: windowText(courier.rebook.start, courier.rebook.end, now) } : null;
  return { options, rebooked };
}

export async function rebookDelivery(user: PlatformUser, orderId: string, window: { start: string }, now: Date = new Date()): Promise<RebookView> {
  const order = await getCourierOrder(orderId);
  if (!order || order.user_id !== user.id) throw new APIError(404, "Order not found");
  if (order.status !== "in_transit") throw new APIError(409, "This order is not out for delivery.");
  const courier = await getOwnedOrderCourier(user.id, orderId);
  if (!courier) throw new APIError(409, "No rider has been sent yet, so there is nothing to rebook.");

  // Only a window we offer: recomputed here, never taken from the browser.
  const chosen = nextWindows(await loadWindowSlots(), now).find((o) => Date.parse(o.start) === Date.parse(window.start));
  if (!chosen) throw new APIError(400, "That window is no longer available. Pick another.");

  const at = now.toISOString();
  if (!(await setCourierRebook(user.id, orderId, { start: chosen.start, end: chosen.end }, at))) {
    throw new APIError(409, "No rider has been sent yet, so there is nothing to rebook.");
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: AUDIT_ACTOR_ROLES.USER,
    action: "order_delivery_rebooked",
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: orderId,
    metadata: { window_start: chosen.start, window_end: chosen.end, previous_window: courier.window },
  });
  await recordOrderEvent({
    order_id: orderId,
    order_group_id: order.order_group_id,
    kind: "note",
    title: "Delivery rebooked",
    detail: `You missed the rider; rebooked for ${chosen.label}.`,
    occurred_at: at,
    created_by: user.id,
  });
  notifyStaff({ kind: "delivery_rebooked", orderId, at, window: chosen.label });

  const orderUrl = `${env.app.url}/app/orders/${orderId}`;
  await notifyCustomer({
    userId: user.id,
    event: DELIVERY_REBOOKED_EVENT,
    payload: { order_id: orderId, order_no: order.order_no, order_count: 1, window: chosen.label, href: `/app/orders/${orderId}` },
    template: renderEmail(`Delivery rebooked: ${order.order_no}`, {
      preheader: `We'll bring it ${chosen.label}.`,
      body: `
        ${eyebrow("Delivery", "green")}
        ${heading("Your delivery is rebooked")}
        ${paragraph(`We'll bring ${escapeHtml(order.product_name)} <strong>${escapeHtml(chosen.label)}</strong>. You get the rider's name and number when it goes out.`)}
        ${button(orderUrl, "See your order")}
      `,
      reason: "You are getting this because you rebooked the delivery of your order.",
    }),
    now,
    whatsapp: {
      message: whatsappMessages.shipmentUpdate({ orderId, what: `order ${order.order_no}`, update: `Delivery rebooked for ${chosen.label}` }),
      dedupeKey: `${DELIVERY_REBOOKED_EVENT}:${orderId}:${at}`,
    },
    source: "delivery-rebook",
  });

  return { options: nextWindows(await loadWindowSlots(), now), rebooked: { start: chosen.start, end: chosen.end, label: chosen.label } };
}
