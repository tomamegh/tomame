import "server-only";

import {
  getCourierOrder,
  getOrderCourier,
  getOwnedOrderCourier,
  getProfileDisplayName,
  listOwnedOrderCouriers,
  stampCourierNotified,
  upsertOrderCourier,
  type CourierOrderRow,
} from "@/db/queries/order-courier";
import {
  getRecipientEmail,
  insertNotification,
  markNotificationDelivered,
} from "@/db/queries/notifications";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import type { PlatformUser } from "@/features/users/types";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError } from "@/lib/auth/api-helpers";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { courierDispatchedTemplate } from "@/lib/email/templates/courier-dispatched";
import { sendEmail } from "@/lib/email/transport";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { formatGhanaPhone, maskPhone, PROVIDER_LABELS, type CourierHandoff } from "../schema";
import type { AdminOrderCourier, CourierDispatchResult, OrderCourier } from "../types";

/**
 * The last-mile hand-off (migration 075): "a rider has your package, here is
 * their number, here is the ride".
 *
 * ONLY WHILE `in_transit`. The rider is the last stretch of that status; the
 * order does NOT change status here. Delivered stays its own admin action,
 * because a rider leaving with the parcel is not the parcel arriving.
 *
 * RE-SENDING IS ALLOWED, DOUBLE-CLICKING IS NOT. A new link (the first Yango
 * trip was cancelled) or a different rider must reach the customer, so a save
 * with changed details sends again and is audited as `order_courier_updated`.
 * The SAME details within `DUPLICATE_WINDOW_MS` are a double submit: nothing is
 * written or sent, and the caller is told so.
 *
 * THE MESSAGE NEVER UNDOES THE SAVE. The courier is stored and audited before
 * the notification is attempted; a transport failure is reported as an outcome
 * and leaves a `failed` notification row the admin log can show.
 */

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export async function dispatchOrderCourier(
  admin: PlatformUser,
  orderId: string,
  input: CourierHandoff,
  now: Date = new Date(),
): Promise<CourierDispatchResult> {
  // The second lock on the door; the route checks the session too.
  if (!canAccessAdmin(admin)) throw new APIError(403, "Admin access required");

  const order = await getCourierOrder(orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.status !== "in_transit") {
    throw new APIError(
      409,
      `A rider can only be sent for an order that is in transit. This one is '${order.status}'.`,
    );
  }

  const previous = await getOrderCourier(orderId);
  if (previous && sameDetails(previous, input) && previous.lastNotifiedAt) {
    const age = now.getTime() - Date.parse(previous.lastNotifiedAt);
    if (age >= 0 && age < DUPLICATE_WINDOW_MS) {
      return { courier: previous, action: "duplicate", notification: "skipped" };
    }
  }

  const action = previous ? "order_courier_updated" : "order_courier_dispatched";
  const nowIso = now.toISOString();

  const saved = await upsertOrderCourier({
    orderId,
    userId: order.user_id,
    name: input.courier_name,
    phone: input.courier_phone,
    trackingUrl: input.tracking_url,
    provider: input.provider,
    // When the parcel first left with a rider. A corrected link is not a
    // second departure.
    dispatchedAt: previous?.dispatchedAt ?? nowIso,
    dispatchedBy: admin.id,
  });

  await logAuditEvent({
    actorId: admin.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action,
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: orderId,
    // Masked: audit_logs is append-only and read by every admin, and a full
    // phone number there outlives the delivery it was for.
    metadata: {
      courier_name: input.courier_name,
      courier_phone: maskPhone(input.courier_phone),
      provider: input.provider,
      tracking_host: input.tracking_url ? new URL(input.tracking_url).hostname : null,
      previous: previous
        ? {
            courier_name: previous.name,
            courier_phone: maskPhone(previous.phone),
            provider: previous.provider,
          }
        : null,
    },
  });

  await recordOrderEvent({
    order_id: orderId,
    order_group_id: order.order_group_id,
    kind: "out_for_delivery",
    title: previous ? "Rider details updated" : "A rider has your package",
    detail: describeCourier(input),
    occurred_at: nowIso,
    created_by: admin.id,
  });

  const notification = await notifyCourierDispatched(order, saved, Boolean(previous), now);
  const courier =
    notification === "notified" || notification === "email_failed"
      ? { ...saved, lastNotifiedAt: nowIso }
      : saved;

  return { courier, action, notification };
}

function sameDetails(previous: OrderCourier, input: CourierHandoff): boolean {
  return (
    (previous.name ?? null) === input.courier_name &&
    (previous.phone ?? null) === input.courier_phone &&
    (previous.trackingUrl ?? null) === input.tracking_url
  );
}

/** "Kofi · +233 24 412 3456 · Yango" — the customer's timeline line. */
function describeCourier(input: CourierHandoff): string {
  return [
    input.courier_name,
    input.courier_phone ? formatGhanaPhone(input.courier_phone) : null,
    input.provider && input.provider !== "other" ? `Tracking on ${PROVIDER_LABELS[input.provider]}` : input.tracking_url ? "Live tracking link" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Bell row + email, the same pipeline `notifyParcelPhotoAdded` uses.
 *
 * The bell (`notifications`, channel `email`) is the delivery; the email is the
 * channel the customer may switch off (`mayEmailUser`). WhatsApp is NOT sent:
 * `profiles.whatsapp_opt_in` exists but there is no WhatsApp transport in the
 * codebase yet, and a `whatsapp` row nobody sends would sit `pending` forever.
 */
async function notifyCourierDispatched(
  order: CourierOrderRow,
  courier: OrderCourier,
  isUpdate: boolean,
  now: Date,
): Promise<CourierDispatchResult["notification"]> {
  const orderPath = `/app/orders/${order.id}`;
  const orderUrl = `${env.app.url}${orderPath}`;
  const providerName =
    courier.provider && courier.provider !== "other" ? PROVIDER_LABELS[courier.provider] : null;

  try {
    const row = await insertNotification({
      user_id: order.user_id,
      channel: "email",
      event: "courier_dispatched",
      payload: {
        order_id: order.id,
        order_no: order.order_no,
        product_name: order.product_name,
        courier_name: courier.name,
        courier_phone: maskPhone(courier.phone),
        provider: courier.provider,
        has_tracking_link: Boolean(courier.trackingUrl),
        is_update: isUpdate,
        href: orderPath,
      },
    });

    let delivered = false;
    if (await mayEmailUser(order.user_id)) {
      const email = await getRecipientEmail(order.user_id);
      if (email) {
        const template = courierDispatchedTemplate({
          orderNo: order.order_no,
          productName: order.product_name,
          quantity: order.quantity,
          orderUrl,
          courierName: courier.name,
          phoneE164: courier.phone,
          phoneDisplay: courier.phone ? formatGhanaPhone(courier.phone) : null,
          trackingUrl: courier.trackingUrl,
          providerName,
          isUpdate,
        });
        try {
          await sendEmail({ to: email, subject: template.subject, html: template.html, text: template.text });
          delivered = true;
        } catch (error) {
          logger.error("courier notification: send failed", {
            orderId: order.id,
            notificationId: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      delivered = true;
    }

    await markNotificationDelivered(row.id, {
      status: delivered ? "sent" : "failed",
      sent_at: now.toISOString(),
    });
    // Stamped either way: the bell row exists, so the customer HAS been told
    // in the app even when the email bounced.
    await stampCourierNotified(order.id, now.toISOString());
    return delivered ? "notified" : "email_failed";
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    logger.error("courier notification failed", {
      orderId: order.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** The admin card's state: the courier plus the name of who last sent it. */
export async function getAdminOrderCourier(orderId: string): Promise<AdminOrderCourier | null> {
  const courier = await getOrderCourier(orderId);
  if (!courier) return null;
  let dispatchedByName: string | null = null;
  if (courier.dispatchedBy) {
    // Most admin profiles carry no name; the address still says who it was.
    dispatchedByName =
      (await getProfileDisplayName(courier.dispatchedBy)) ??
      (await getRecipientEmail(courier.dispatchedBy).catch(() => null));
  }
  return { ...courier, dispatchedByName };
}

/**
 * The customer's view: only their own order, and null (not an error) for
 * anything else, so the order page cannot be used to probe other orders.
 */
export async function getCourierForViewer(
  viewerId: string | null | undefined,
  orderId: string,
): Promise<OrderCourier | null> {
  if (!viewerId) return null;
  try {
    return await getOwnedOrderCourier(viewerId, orderId);
  } catch (error) {
    // A missing courier must never take the order page down with it.
    logger.error("courier read failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** One query for a list of the viewer's orders. Empty map on failure. */
export async function listCouriersForViewer(
  viewerId: string,
  orderIds: readonly string[],
): Promise<Map<string, OrderCourier>> {
  try {
    return await listOwnedOrderCouriers(viewerId, orderIds);
  } catch (error) {
    logger.error("courier batch read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}
