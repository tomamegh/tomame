import "server-only";

import {
  getRecipientEmail,
  insertNotification,
  markNotificationDelivered,
} from "@/db/queries/notifications";
import { queueWhatsApp } from "@/features/notifications/services/whatsapp.service";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { shipmentUpdateTemplate } from "@/lib/email/templates/shipment-update";
import { sendEmail } from "@/lib/email/transport";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { whatsappMessages } from "@/lib/whatsapp/templates";

import type { Contact } from "./stages";

/**
 * Tell a customer their parcel moved, or is late (098).
 *
 * Bell + email + WhatsApp, one of each per customer per move: a package with
 * three of one customer's orders sends one message naming all three. Same
 * contract as `notifyParcelPhotoAdded`: the bell row is the delivery, email is
 * a channel the customer may switch off, and NOTHING here may undo the move
 * that called it, so every failure is logged and swallowed (a missing relation
 * excepted, which means a deploy ran ahead of its migration).
 */
export interface ShipmentNotifyInput {
  kind: "stage" | "delay";
  userId: string;
  stageKey: string;
  stageTitle: string;
  description: string;
  message: string | null;
  /** ISO date of a delay's new estimate. */
  expectedOn: string | null;
  orders: Array<{ id: string; orderNo: string; productName: string }>;
  contact: Contact | null;
  /**
   * Set when the move was also an order STATUS change (a package shipping, or
   * being delivered). WhatsApp then uses that status's approved template, named
   * for the whole package, instead of the generic step update.
   */
  orderStatus?: "in_transit" | "delivered";
}

export async function notifyShipmentUpdate(input: ShipmentNotifyInput, now: Date = new Date()): Promise<void> {
  const first = input.orders[0];
  if (!first) return;
  const journeyUrl = `${env.app.url}/app/orders/${first.id}`;
  const what = input.orders.length === 1 ? `order ${first.orderNo}` : `${input.orders.length} of your orders`;
  const expected = input.expectedOn ? formatDay(input.expectedOn) : null;
  const event = input.kind === "delay" ? "shipment_delay" : "shipment_update";

  try {
    const notification = await insertNotification({
      user_id: input.userId,
      channel: "email",
      event,
      payload: {
        order_ids: input.orders.map((o) => o.id),
        order_no: first.orderNo,
        order_count: input.orders.length,
        stage: input.stageKey,
        stage_title: input.stageTitle,
        message: input.message,
        expected_on: input.expectedOn,
        href: `/app/orders/${first.id}`,
      },
    });

    const reason = [input.message?.trim() || input.description, expected ? `now expected ${expected}` : null]
      .filter(Boolean)
      .join(", ");
    const packageName =
      input.orders.length === 1 ? first.productName : `your package of ${input.orders.length} items`;
    await queueWhatsApp({
      userId: input.userId,
      event,
      message: input.orderStatus
        ? whatsappMessages.orderStatus({
            orderId: first.id,
            productName: packageName,
            status: input.orderStatus,
            trackingNumber: first.orderNo,
          })
        : input.kind === "delay"
          ? whatsappMessages.shipmentDelay({ orderId: first.id, what, reason: trimSentence(reason) })
          : whatsappMessages.shipmentUpdate({
              orderId: first.id,
              what,
              update: trimSentence(`${input.stageTitle}. ${input.message?.trim() || input.description}`),
            }),
      dedupeKey: `${event}:${first.id}:${input.stageKey}:${now.toISOString().slice(0, 16)}`,
    });

    let delivered = true;
    if (await mayEmailUser(input.userId)) {
      const email = await getRecipientEmail(input.userId);
      if (email) {
        const template = shipmentUpdateTemplate({
          kind: input.kind,
          stageTitle: input.stageTitle,
          description: input.kind === "delay" ? input.message?.trim() || input.description : input.description,
          message: input.kind === "delay" ? null : input.message,
          expectedOn: expected,
          items: input.orders.map((o) => ({ orderNo: o.orderNo, productName: o.productName })),
          contact: input.contact,
          journeyUrl,
        });
        try {
          await sendEmail({ to: email, subject: template.subject, html: template.html });
        } catch (error) {
          delivered = false;
          logger.error("shipment notification: send failed", {
            userId: input.userId,
            notificationId: notification.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    await markNotificationDelivered(notification.id, {
      status: delivered ? "sent" : "failed",
      sent_at: now.toISOString(),
    });
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    logger.error("shipment notification failed", {
      userId: input.userId,
      kind: input.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** WhatsApp parameters may not end in a full stop the template already supplies. */
function trimSentence(text: string): string {
  return text.trim().replace(/[.\s]+$/, "").slice(0, 300);
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" }).format(date);
}
