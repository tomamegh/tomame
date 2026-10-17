import "server-only";

import { getRecipientEmail, insertNotification, markNotificationDelivered } from "@/db/queries/notifications";
import { queueWhatsApp } from "@/features/notifications/services/whatsapp.service";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { sendEmail } from "@/lib/email/transport";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import type { WhatsAppMessage } from "@/lib/whatsapp/templates";

/**
 * Tell a customer something from a background job: WhatsApp (its own channel
 * and opt-in), the in-app bell row, and email when they allow it. Never throws
 * except for a missing table, which is a deploy bug that must surface.
 */
export async function notifyCustomer(input: {
  userId: string;
  event: string;
  payload: Record<string, unknown>;
  template: { subject: string; html: string };
  now: Date;
  whatsapp: { message: WhatsAppMessage; dedupeKey: string };
  /** Names the job in the failure log ("reconcile-payments"). */
  source: string;
}): Promise<void> {
  const { userId, event, payload, template, now, whatsapp, source } = input;
  let notificationId: string | null = null;
  try {
    // Its own channel and opt-in; queued whatever the email preference says.
    await queueWhatsApp({ userId, event, message: whatsapp.message, dedupeKey: whatsapp.dedupeKey });
    notificationId = (await insertNotification({ user_id: userId, channel: "email", event, payload })).id;
    // The in-app notification (the bell) exists regardless of the email
    // preference; "sent" here means the customer has been told through the
    // channel they allow, and the row is not left pending for a mail that will
    // never be attempted.
    if (!(await mayEmailUser(userId))) {
      await markNotificationDelivered(notificationId, { status: "sent", sent_at: now.toISOString() });
      return;
    }
    const email = await getRecipientEmail(userId);
    if (!email) {
      await markNotificationDelivered(notificationId, { status: "failed" });
      return;
    }
    await sendEmail({ to: email, subject: template.subject, html: template.html });
    await markNotificationDelivered(notificationId, { status: "sent", sent_at: now.toISOString() });
  } catch (error: unknown) {
    if (isSchemaMissingError(error)) throw error;
    logger.error(`${source}: notification failed`, {
      userId, event, notificationId, error: error instanceof Error ? error.message : String(error),
    });
    if (notificationId) {
      await markNotificationDelivered(notificationId, { status: "failed" }).catch(() => undefined);
    }
  }
}
