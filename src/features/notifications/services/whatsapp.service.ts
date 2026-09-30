import "server-only";

import {
  claimWhatsAppNotification,
  findWhatsAppNotificationByMessageId,
  getWhatsAppRecipient,
  insertWhatsAppNotification,
  listDueWhatsAppNotifications,
  updatePendingWhatsAppNotification,
  updateWhatsAppDelivery,
  type WhatsAppDeliveryStatus,
  type WhatsAppNotificationRow,
} from "@/db/queries/whatsapp-notifications";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { sendTemplateMessage } from "@/lib/whatsapp/client";
import { whatsappConfig } from "@/lib/whatsapp/config";
import { normaliseWhatsAppPhone } from "@/lib/whatsapp/phone";
import {
  WHATSAPP_LANGUAGE,
  WHATSAPP_TEMPLATES,
  greetingName,
  placeholderCount,
  renderTemplateBody,
  type WhatsAppMessage,
  type WhatsAppTemplateKey,
} from "@/lib/whatsapp/templates";
import type { WhatsAppStatusUpdate } from "@/lib/whatsapp/webhook";

/**
 * WhatsApp: the second channel.
 *
 * QUEUE, THEN DISPATCH. A customer event (order paid, rider sent, …) calls
 * `queueWhatsApp` beside its email. That writes one `notifications` row,
 * channel 'whatsapp', status 'pending' — and does nothing else, so no request
 * path or money job ever waits on Meta. `/api/cron/whatsapp-dispatch` (pg_cron
 * every minute, migration 079) calls `dispatchDueWhatsApp`, which sends a small
 * batch and walks each row through the state machine:
 *
 *   pending → sent    Meta accepted it (delivery_status 'accepted')
 *   pending → failed  a permanent error, or the third retryable one
 *   pending → pending a retryable error: attempts + 1, next_attempt_at backed off
 *
 * Meta's webhook then reports sent / delivered / read / failed into
 * `delivery_status` (`applyWhatsAppStatuses`), forward-only.
 *
 * GATES, all at queue time, all silent: the channel is configured
 * (`whatsappConfig()`), the customer opted in (`profiles.whatsapp_opt_in`) and
 * their number normalises. Opt-in and phone are checked AGAIN at send time — a
 * customer who switches WhatsApp off a minute after paying must not get it.
 *
 * NO audit_logs rows: CLAUDE.md scopes auditing to payment, order, role and job
 * state; a notification's delivery is none of those (the same call
 * notifications.service makes for read state).
 */

export const WHATSAPP_MAX_ATTEMPTS = 3;
export const WHATSAPP_BATCH_SIZE = 20;
/** Wait before attempt 2 and attempt 3. */
const BACKOFF_MS = [60_000, 5 * 60_000] as const;
/** A claimed row is invisible to other runs for this long — longer than a send can take. */
const CLAIM_LEASE_MS = 2 * 60_000;

export type QueueOutcome =
  | "queued"
  | "duplicate"
  | "not_configured"
  | "no_message"
  | "no_account"
  | "opted_out"
  | "no_phone"
  | "error";

/**
 * Never throws — the caller has already done the real work (settled a payment,
 * sent a rider) and must not fail because WhatsApp could not be queued. A
 * missing column/table is the exception, re-thrown so an un-migrated database
 * is loud rather than quietly dropping every message.
 */
export async function queueWhatsApp(input: {
  userId: string | null;
  event: string;
  message: WhatsAppMessage | null;
  /** One message per fact, e.g. `order_status:<id>:paid`. */
  dedupeKey?: string | null;
}): Promise<QueueOutcome> {
  if (!whatsappConfig()) return "not_configured";
  if (!input.message) return "no_message";
  if (!input.userId) return "no_account";

  try {
    const recipient = await getWhatsAppRecipient(input.userId);
    if (!recipient) return "no_account";
    if (!recipient.whatsapp_opt_in) return "opted_out";
    if (!normaliseWhatsAppPhone(recipient.phone)) return "no_phone";

    const def = WHATSAPP_TEMPLATES[input.message.template];
    const params = [greetingName(recipient.first_name), ...input.message.params];
    const row = await insertWhatsAppNotification({
      user_id: input.userId,
      event: input.event,
      dedupe_key: input.dedupeKey ?? null,
      payload: {
        template_key: input.message.template,
        template: def.name,
        language: WHATSAPP_LANGUAGE,
        params,
        button_path: input.message.buttonPath,
        preview: renderTemplateBody(input.message.template, params),
      },
    });
    return row ? "queued" : "duplicate";
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    logger.error("whatsapp: could not queue", {
      event: input.event,
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

export interface DispatchSummary {
  [key: string]: unknown;
  skipped?: "not_configured";
  checked: number;
  sent: number;
  retrying: number;
  failed: number;
  /** Rows another run claimed first. */
  contended: number;
}

export async function dispatchDueWhatsApp(
  opts: { now?: Date; limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { checked: 0, sent: 0, retrying: 0, failed: 0, contended: 0 };
  const config = whatsappConfig();
  if (!config) return { ...summary, skipped: "not_configured" };

  const now = opts.now ?? new Date();
  const rows = await listDueWhatsAppNotifications(now.toISOString(), opts.limit ?? WHATSAPP_BATCH_SIZE);

  for (const row of rows) {
    summary.checked += 1;
    const attempt = row.attempts + 1;
    const claimed = await claimWhatsAppNotification(row.id, row.attempts, {
      attempts: attempt,
      last_attempt_at: now.toISOString(),
      next_attempt_at: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
    });
    if (!claimed) {
      summary.contended += 1;
      continue;
    }

    const outcome = await deliverOne(row, config, opts.fetchImpl);
    const nowIso = new Date().toISOString();

    if (outcome.ok) {
      await updatePendingWhatsAppNotification(row.id, {
        status: "sent",
        sent_at: nowIso,
        provider_message_id: outcome.messageId,
        delivery_status: "accepted",
        next_attempt_at: null,
        error_code: null,
        error_reason: null,
      });
      summary.sent += 1;
      continue;
    }

    const exhausted = attempt >= WHATSAPP_MAX_ATTEMPTS;
    if (!outcome.retryable || exhausted) {
      await updatePendingWhatsAppNotification(row.id, {
        status: "failed",
        delivery_status: "failed",
        next_attempt_at: null,
        error_code: outcome.code,
        error_reason: exhausted && outcome.retryable ? `${outcome.reason} (gave up after ${attempt} attempts)` : outcome.reason,
      });
      summary.failed += 1;
      logger.warn("whatsapp: message failed", { notificationId: row.id, event: row.event, code: outcome.code, attempt });
      continue;
    }

    await updatePendingWhatsAppNotification(row.id, {
      next_attempt_at: new Date(now.getTime() + BACKOFF_MS[attempt - 1]!).toISOString(),
      error_code: outcome.code,
      error_reason: outcome.reason,
    });
    summary.retrying += 1;
  }

  return summary;
}

type DeliverOutcome =
  | { ok: true; messageId: string }
  | { ok: false; retryable: boolean; code: string; reason: string };

async function deliverOne(
  row: WhatsAppNotificationRow,
  config: NonNullable<ReturnType<typeof whatsappConfig>>,
  fetchImpl?: typeof fetch,
): Promise<DeliverOutcome> {
  const payload = row.payload as {
    template_key?: string;
    params?: unknown;
    button_path?: unknown;
  };
  const key = payload.template_key as WhatsAppTemplateKey | undefined;
  const def = key ? WHATSAPP_TEMPLATES[key] : undefined;
  const params = Array.isArray(payload.params) ? payload.params.map(String) : null;
  if (!def || !params || params.length !== placeholderCount(def.body)) {
    return { ok: false, retryable: false, code: "template_mismatch", reason: "Row does not match a known template" };
  }

  // Re-read at send time: the opt-in can be withdrawn, the number changed.
  const recipient = await getWhatsAppRecipient(row.user_id);
  if (!recipient?.whatsapp_opt_in) {
    return { ok: false, retryable: false, code: "opted_out", reason: "Customer turned WhatsApp off before it was sent" };
  }
  const to = normaliseWhatsAppPhone(recipient.phone);
  if (!to) {
    return { ok: false, retryable: false, code: "no_phone", reason: "No usable phone number on the profile" };
  }

  const buttonPath = typeof payload.button_path === "string" ? payload.button_path : null;
  return sendTemplateMessage(
    config,
    {
      to,
      template: def.name,
      languageCode: WHATSAPP_LANGUAGE,
      bodyParams: params,
      buttonUrlParam: def.button && buttonPath ? buttonPath.replace(/^\/+/, "") : null,
    },
    fetchImpl,
  );
}

// ── Webhook status callbacks ─────────────────────────────────────────────────

const RANK: Record<WhatsAppDeliveryStatus, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/**
 * May `current` become `next`? Forward only: sent → delivered → read. Failed
 * is terminal and cannot overwrite a message the handset already received
 * (Meta can report a late failure for a retried leg of one it delivered).
 */
export function nextDeliveryStatus(
  current: WhatsAppDeliveryStatus | null,
  next: WhatsAppStatusUpdate["status"],
): WhatsAppDeliveryStatus | null {
  if (current === "failed") return null;
  if (next === "failed") return current === "delivered" || current === "read" ? null : "failed";
  if (current === null) return next;
  return RANK[next] > RANK[current] ? next : null;
}

export interface StatusSummary {
  updated: number;
  ignored: number;
  unknown: number;
}

export async function applyWhatsAppStatuses(updates: readonly WhatsAppStatusUpdate[]): Promise<StatusSummary> {
  const summary: StatusSummary = { updated: 0, ignored: 0, unknown: 0 };

  for (const update of updates) {
    const row = await findWhatsAppNotificationByMessageId(update.messageId);
    if (!row) {
      summary.unknown += 1;
      continue;
    }
    const target = nextDeliveryStatus(row.delivery_status, update.status);
    if (!target) {
      summary.ignored += 1;
      continue;
    }
    const at = update.at ?? new Date().toISOString();
    const fields: Record<string, unknown> = { delivery_status: target };
    // A read receipt implies delivery; stamp delivered_at only if the delivered callback never came.
    if (target === "delivered" || (target === "read" && row.delivery_status !== "delivered")) fields.delivered_at = at;
    if (target === "read") fields.seen_at = at;
    if (target === "failed") {
      fields.error_code = update.errorCode;
      fields.error_reason = update.errorReason ?? "Meta could not deliver it";
    }
    // `status` is left alone: 'sent' meant "Meta accepted it" and the state
    // machine has no sent → failed edge. The delivery failure is recorded here
    // and shown beside it in the admin log.
    if (await updateWhatsAppDelivery(row.id, row.delivery_status, fields)) summary.updated += 1;
    else summary.ignored += 1;
  }
  return summary;
}
