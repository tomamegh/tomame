import "server-only";

import {
  getRecipientEmail,
  insertNotification,
  markNotificationDelivered,
} from "@/db/queries/notifications";
import { env } from "@/lib/env";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { parcelPhotoTemplate } from "@/lib/email/templates/parcel-photo";
import { sendEmail } from "@/lib/email/transport";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";

/**
 * Tell the customer a photo of their parcel has landed (migration 054).
 *
 * WHY THIS ONE IS WORTH AN EMAIL when most things are not. The photo is the only
 * moment a customer sees what was actually bought rather than what they asked
 * for, and it is useful for exactly as long as the parcel sits at the hub. A
 * bell entry alone reaches whoever happens to open the app in that window; the
 * email reaches the rest. Kelvin's call: bell AND email.
 *
 * THE BELL IS THE DELIVERY; the email is a second channel the customer may
 * switch off (`profiles.notify_email`, honoured by `mayEmailUser`). A customer
 * with email off still gets the bell, and the notification row is still closed
 * `sent` — a row left `pending` reads as a stuck queue in the admin log.
 *
 * ONE MESSAGE PER BATCH, NOT PER PHOTO. An operator photographing a parcel takes
 * the front, the label and the damaged corner within the same minute; three
 * emails about one arrival trains the customer to ignore the fourth. The caller
 * passes how many were added and this writes once.
 *
 * THIS MUST NEVER UNDO THE UPLOAD. The photo is already stored and its row is
 * already written by the time we are called, so every failure here is swallowed
 * and reported as an outcome — with one exception, a missing relation, which
 * means a deploy ran ahead of its migrations and must be loud. That is the same
 * rule `notifyPasteFinished` follows, and it exists because a notification
 * failure there once requeued a finished extraction and charged a vendor twice.
 */
export type ParcelPhotoNotifyOutcome = "notified" | "no_account" | "nothing_visible" | "error";

export interface ParcelPhotoNotifyInput {
  orderId: string;
  /** Null for an order with no owner on file; nothing is sent. */
  userId: string | null;
  orderNo: string;
  productName: string;
  /** How many CUSTOMER-VISIBLE photos this upload added. */
  photoCount: number;
  location?: string | null;
  weightLbs?: number | null;
}

export async function notifyParcelPhotoAdded(
  input: ParcelPhotoNotifyInput,
  now: Date = new Date(),
): Promise<ParcelPhotoNotifyOutcome> {
  if (!input.userId) return "no_account";

  // An internal-only photo is not news for the customer: `is_customer_visible`
  // is false precisely so an operator can file a picture without showing it, and
  // mailing about one the customer then cannot see would be worse than silence.
  if (input.photoCount < 1) return "nothing_visible";

  const journeyUrl = `${env.app.url}/app/orders/${input.orderId}`;

  try {
    const notification = await insertNotification({
      user_id: input.userId,
      channel: "email",
      event: "parcel_photo_added",
      payload: {
        order_id: input.orderId,
        order_no: input.orderNo,
        product_name: input.productName,
        photo_count: input.photoCount,
        location: input.location ?? null,
        weight_lbs: input.weightLbs ?? null,
        href: journeyUrl.slice(env.app.url.length),
      },
    });

    let delivered = false;
    if (await mayEmailUser(input.userId)) {
      const email = await getRecipientEmail(input.userId);
      if (email) {
        const template = parcelPhotoTemplate({
          productName: input.productName,
          orderNo: input.orderNo,
          journeyUrl,
          location: input.location ?? null,
          weightLbs: input.weightLbs ?? null,
          photoCount: input.photoCount,
        });
        try {
          await sendEmail({ to: email, subject: template.subject, html: template.html });
          delivered = true;
        } catch (error) {
          logger.error("parcel photo notification: send failed", {
            orderId: input.orderId,
            notificationId: notification.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      // Email declined by the customer: the bell is the delivery.
      delivered = true;
    }

    await markNotificationDelivered(notification.id, {
      status: delivered ? "sent" : "failed",
      sent_at: now.toISOString(),
    });
    return "notified";
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    logger.error("parcel photo notification failed", {
      orderId: input.orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}
