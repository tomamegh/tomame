import "server-only";

import type { ExtractionJobRow } from "@/db/queries/extraction-requests";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { getRecipientEmail, insertNotification, markNotificationDelivered } from "@/db/queries/notifications";
import { PENDING_SLOW_MS } from "@/features/bag/components/format";
import { env } from "@/lib/env";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { pastePricedTemplate, pasteUnreadableTemplate } from "@/lib/email/templates/paste-finished";
import { sendEmail } from "@/lib/email/transport";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";

/**
 * Tell the customer a paste has finished — but only when they were told to wait.
 *
 * At 5 s the paste screen and the bag both switch to "carry on shopping — we'll
 * tell you the moment it's done" (`describePendingWait`). That sentence was
 * written by the UI and honoured by nothing: the job finished and the only way
 * to learn of it was to still be looking at the row. This is the honouring.
 *
 * THE 5 s RULE, in both directions. A job that lands inside the mark never
 * promised anything — the customer is still on the screen and is forwarded to
 * the price — so it sends nothing; a bell entry for every quick paste would bury
 * the ones that matter. A job that crossed the mark sends exactly one entry,
 * whichever way it went, because "we'll let you know" has to mean both outcomes.
 *
 * SIGNED-IN ONLY. `notifications.user_id` is NOT NULL and a `tm_quote_session`
 * visitor has no address; the copy they see says the price appears in place,
 * and promises no message (`PendingWaitOptions.notifies`).
 *
 * The bell entry is the row itself (channel `email`, like every row this table
 * holds); the email is sent on top of it when the account's "Email" toggle
 * allows. A customer with email off still gets the bell.
 */
export type PasteNotifyOutcome = "notified" | "too_quick" | "no_account" | "error";

export async function notifyPasteFinished(
  job: Pick<ExtractionJobRow, "id" | "user_id" | "product_url" | "created_at">,
  result: { status: "ready"; extractionCacheId: string } | { status: "failed" },
  now: Date = new Date(),
): Promise<PasteNotifyOutcome> {
  if (!job.user_id) return "no_account";

  const elapsed = now.getTime() - new Date(job.created_at).getTime();
  if (Number.isFinite(elapsed) && elapsed < PENDING_SLOW_MS) return "too_quick";

  try {
    const host = hostOf(job.product_url);
    const finished = await classify(result);

    const destinationUrl =
      finished.kind === "priced"
        ? `${env.app.url}/app/orders/review/${finished.extractionCacheId}`
        : `${env.app.url}/app/orders/new`;

    const notification = await insertNotification({
      user_id: job.user_id,
      channel: "email",
      event: finished.kind === "priced" ? "paste_priced" : "paste_unreadable",
      payload: {
        extraction_request_id: job.id,
        product_url: job.product_url,
        store_host: host,
        product_name: finished.productName,
        extraction_cache_id: finished.kind === "priced" ? finished.extractionCacheId : null,
        href: destinationUrl.slice(env.app.url.length),
      },
    });

    // The bell entry stands on its own; the email is a second channel the
    // customer can switch off. A row left `pending` would read as a stuck
    // queue in the admin list, so it is closed either way.
    let delivered = false;
    if (await mayEmailUser(job.user_id)) {
      const email = await getRecipientEmail(job.user_id);
      if (email) {
        const template =
          finished.kind === "priced"
            ? pastePricedTemplate({ storeHost: host, productName: finished.productName, destinationUrl })
            : pasteUnreadableTemplate({ storeHost: host, productName: finished.productName, destinationUrl });
        try {
          await sendEmail({ to: email, subject: template.subject, html: template.html });
          delivered = true;
        } catch (error) {
          logger.error("paste notification: send failed", {
            requestId: job.id,
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
    // A deploy that ran ahead of its migrations must be loud; anything else must
    // not fail the extraction that just succeeded.
    if (isSchemaMissingError(error)) throw error;
    logger.error("paste notification failed", {
      requestId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

/**
 * `ready` is the JOB's verdict, not the quote's. The same question the paste
 * screen asks (`toPasteStatus`) is asked here so the bell cannot say "priced"
 * about a page that was read but yielded no price.
 */
async function classify(
  result: { status: "ready"; extractionCacheId: string } | { status: "failed" },
): Promise<{ kind: "priced"; extractionCacheId: string; productName: string | null } | { kind: "unreadable"; productName: string | null }> {
  if (result.status === "failed") return { kind: "unreadable", productName: null };

  const facts = (await getQuoteFacts([result.extractionCacheId])).get(result.extractionCacheId);
  if (!facts?.usable || !facts.priced) return { kind: "unreadable", productName: facts?.title ?? null };
  return { kind: "priced", extractionCacheId: result.extractionCacheId, productName: facts.title };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}
