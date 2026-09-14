import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PAYMENT_RECONCILIATION, PAYMENT_EXPIRY_MINUTES_KEY, UNPAID_ORDER_TTL_HOURS_KEY } from "@/config/payments";
import { PAYMENT_STATUSES } from "@/config/constants";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { getRecipientEmail, insertNotification, markNotificationDelivered } from "@/db/queries/notifications";
import { listOrdersByGroup } from "@/db/queries/orders";
import { updateOrderGroupStatus, type OrderGroupRow } from "@/db/queries/order-groups";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { Order } from "@/features/orders/types";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import {
  findActivePayment,
  handlePaymentCallback,
  transitionPaymentStatus,
} from "@/features/payments/services/payments.service";
import type { Payment } from "@/features/payments/types";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { paymentExpiredTemplate, unpaidOrderCancelledTemplate } from "@/lib/email/templates/payment-expiry";
import { sendEmail } from "@/lib/email/transport";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyTransaction } from "@/lib/paystack/client";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Payment reconciliation (migration 059): the job that makes sure no payment
 * and no unpaid order waits forever.
 *
 * THE RULE THAT MAKES THIS SAFE: nothing is released or cancelled on our clock
 * alone. Every pending payment is verified against Paystack first, and only a
 * payment Paystack ALSO does not report as successful is released. A customer
 * who paid at minute 61 is settled, not expired, because the verify says so.
 *
 * Three outcomes per pending payment:
 *   - Paystack `success`         → settle through `handlePaymentCallback`, exactly
 *                                  as the webhook or the browser return would have.
 *   - Paystack `failed`/`reversed` → record the failure the same way.
 *   - anything else (`abandoned`, `ongoing`, ...) → left alone until the payment
 *                                  is older than `payment_expiry_minutes`, then
 *                                  released: `pending → failed` with
 *                                  `metadata.expired_at`, an audit row, and a mail
 *                                  telling the customer nothing was charged.
 *
 * A released payment unblocks the retry: `assertNoActivePayment` refuses a
 * second transaction while one is pending, so a stuck row was holding the bag
 * hostage. The order itself is NOT cancelled here; it stays payable, which is
 * how a failed payment already behaves.
 *
 * Then, separately: pending orders and bags with NO pending or successful payment
 * that are older than `unpaid_order_ttl_hours` are cancelled, with an audit row,
 * a timeline event and a mail. By construction their payments have all been
 * verified as not-successful (or never existed), so this too never cancels
 * something Paystack has money for.
 *
 * LATE MONEY. A customer can reopen an expired Paystack link and pay. That case
 * is handled in `handlePaymentCallback`, which allows a payment WE expired to
 * move `failed → success` and settles it; if its order was already cancelled by
 * the second half of this job, the audit row says so and the admin owes a
 * refund. See `payments.service.ts`.
 */

export interface ReconcileSummary {
  /** Pending payments verified against Paystack this run. */
  checked: number;
  /** Paystack said success; settled. */
  settled: number;
  /** Paystack said failed or reversed; recorded. */
  failed: number;
  /** Abandoned past the expiry; released so the customer can pay again. */
  expired: number;
  /** Verify call did not answer; left pending for the next run. */
  unreachable: number;
  /** Abandoned but still inside the expiry window; left pending. */
  leftPending: number;
  /** Single orders closed for non-payment. */
  ordersCancelled: number;
  /** Bags closed for non-payment (their orders are counted in `ordersCancelled`). */
  groupsCancelled: number;
}

export interface PaymentTimeouts {
  expiryMinutes: number;
  unpaidOrderTtlHours: number;
}

/**
 * The admin-tuned durations, read once per run. A missing or unusable row falls
 * back to the constant AND logs, so a typo in `site_settings` degrades to the
 * documented default rather than to "never expire" or "expire at once".
 */
export async function resolvePaymentTimeouts(): Promise<PaymentTimeouts> {
  let settings: Record<string, unknown> = {};
  try {
    settings = await getSiteSettingsMap();
  } catch (error: unknown) {
    if (isSchemaMissingError(error)) throw error;
    logger.warn("reconcile-payments: site settings unavailable; using defaults", { error: String(error) });
  }
  return {
    expiryMinutes: positiveOr(settings[PAYMENT_EXPIRY_MINUTES_KEY], PAYMENT_RECONCILIATION.defaultExpiryMinutes, PAYMENT_EXPIRY_MINUTES_KEY),
    unpaidOrderTtlHours: positiveOr(settings[UNPAID_ORDER_TTL_HOURS_KEY], PAYMENT_RECONCILIATION.defaultUnpaidOrderTtlHours, UNPAID_ORDER_TTL_HOURS_KEY),
  };
}

function positiveOr(value: unknown, fallback: number, key: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  if (value !== undefined) logger.warn("reconcile-payments: unusable setting; using default", { key, value, fallback });
  return fallback;
}

/** Statuses Paystack reports that will never change again. */
const TERMINAL_FAILURE = new Set(["failed", "reversed"]);

export async function reconcilePendingPayments(now: Date = new Date()): Promise<ReconcileSummary> {
  const admin = createAdminClient();
  const timeouts = await resolvePaymentTimeouts();
  const summary: ReconcileSummary = {
    checked: 0, settled: 0, failed: 0, expired: 0, unreachable: 0, leftPending: 0,
    ordersCancelled: 0, groupsCancelled: 0,
  };

  const graceCutoff = minutesBefore(now, PAYMENT_RECONCILIATION.graceMinutes);
  const { data, error } = await admin
    .from("payments")
    .select("*")
    .eq("status", PAYMENT_STATUSES.PENDING)
    .lt("created_at", graceCutoff)
    .order("created_at", { ascending: true })
    .limit(PAYMENT_RECONCILIATION.batchSize);
  if (error) throw new Error(`reconcile-payments: could not list pending payments: ${error.message}`);

  for (const payment of (data ?? []) as Payment[]) {
    summary.checked += 1;
    const outcome = await reconcileOne(admin, payment, timeouts, now);
    summary[outcome] += 1;
  }

  const cancelled = await cancelStaleUnpaid(admin, timeouts, now);
  summary.ordersCancelled = cancelled.orders;
  summary.groupsCancelled = cancelled.groups;
  return summary;
}

type PaymentOutcome = "settled" | "failed" | "expired" | "unreachable" | "leftPending";

async function reconcileOne(
  admin: SupabaseClient,
  payment: Payment,
  timeouts: PaymentTimeouts,
  now: Date,
): Promise<PaymentOutcome> {
  let paystackStatus: string;
  try {
    paystackStatus = (await verifyTransaction(payment.reference)).data.status;
  } catch (error) {
    logger.warn("reconcile-payments: Paystack verify unreachable; left pending", {
      paymentId: payment.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return "unreachable";
  }

  if (paystackStatus === "success" || TERMINAL_FAILURE.has(paystackStatus)) {
    // The same code path the webhook and the browser return use, with the same
    // amount and currency check and the same idempotency guard. A "success"
    // whose amount does not match is recorded as failed by that path, so the
    // count below reads the row afterwards rather than trusting Paystack's word.
    await handlePaymentCallback(payment.reference);
    const { data } = await admin.from("payments").select("status").eq("id", payment.id).maybeSingle();
    return (data as { status?: string } | null)?.status === PAYMENT_STATUSES.SUCCESS ? "settled" : "failed";
  }

  const ageMinutes = (now.getTime() - new Date(payment.created_at).getTime()) / 60_000;
  if (ageMinutes < timeouts.expiryMinutes) return "leftPending";

  return (await expirePayment(admin, payment, paystackStatus, timeouts, now)) ? "expired" : "leftPending";
}

/**
 * Release one abandoned payment. Returns false when the row had already moved
 * (a webhook landed between the list and this write): the other path owns it.
 */
async function expirePayment(
  admin: SupabaseClient,
  payment: Payment,
  paystackStatus: string,
  timeouts: PaymentTimeouts,
  now: Date,
): Promise<boolean> {
  const metadata = (payment.metadata as Record<string, unknown> | null) ?? {};
  const released = await transitionPaymentStatus(
    admin,
    payment.id,
    PAYMENT_STATUSES.PENDING,
    PAYMENT_STATUSES.FAILED,
    { ...metadata, expired_at: now.toISOString(), paystack_status_at_expiry: paystackStatus },
  );
  if (!released) return false;

  const target = { orderId: orderIdOf(payment), groupId: payment.order_group_id ?? null };
  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: "system",
    action: "payment_expired",
    entityType: "payment",
    entityId: payment.id,
    metadata: { reference: payment.reference, ...target, paystackStatus, expiryMinutes: timeouts.expiryMinutes },
  });

  const retryUrl = target.groupId
    ? `${env.app.url}/app/bag`
    : target.orderId
      ? `${env.app.url}/app/orders/${target.orderId}`
      : `${env.app.url}/app/orders`;
  await notify(payment.user_id, "payment_expired", {
    payment_id: payment.id,
    reference: payment.reference,
    amount_ghs: payment.amount / 100,
    order_id: target.orderId,
    order_group_id: target.groupId,
    href: retryUrl.slice(env.app.url.length),
  }, paymentExpiredTemplate({
    amountGhs: payment.amount / 100,
    reference: payment.reference,
    retryUrl,
    expiryMinutes: timeouts.expiryMinutes,
  }), now);
  return true;
}

// ── Unpaid orders and bags ──────────────────────────────────────────────────

async function cancelStaleUnpaid(
  admin: SupabaseClient,
  timeouts: PaymentTimeouts,
  now: Date,
): Promise<{ orders: number; groups: number }> {
  const cutoff = minutesBefore(now, timeouts.unpaidOrderTtlHours * 60);
  let orders = 0;
  let groups = 0;

  // Bags first, so their orders are cancelled as a set rather than one by one.
  const { data: groupRows, error: groupError } = await admin
    .from("order_groups")
    .select("id, user_id, item_count, total_pesewas, status, created_at")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(PAYMENT_RECONCILIATION.orderBatchSize);
  if (groupError) throw new Error(`reconcile-payments: could not list pending groups: ${groupError.message}`);

  for (const group of (groupRows ?? []) as Pick<OrderGroupRow, "id" | "user_id" | "item_count" | "total_pesewas" | "status" | "created_at">[]) {
    // A pending OR successful payment means somebody is paying, or has paid and
    // the settle is mid-flight. Either way this is not ours to close.
    if (await findActivePayment(admin, { groupId: group.id })) continue;

    const flipped = await updateOrderGroupStatus(group.id, "pending", "cancelled");
    if (!flipped) continue;
    groups += 1;

    const members = await listOrdersByGroup(admin, group.id);
    for (const order of members) {
      if (await cancelOrderUnpaid(admin, order, timeouts, now, group.id)) orders += 1;
    }

    await logAuditEvent({
      actorId: group.user_id,
      actorRole: "system",
      action: "order_group_expired_unpaid",
      entityType: "order_group",
      entityId: group.id,
      metadata: { ttlHours: timeouts.unpaidOrderTtlHours, order_ids: members.map((o) => o.id) },
    });

    await notify(group.user_id, "order_expired_unpaid", {
      order_group_id: group.id,
      item_count: Number(group.item_count),
      amount_ghs: Number(group.total_pesewas) / 100,
      href: "/app/orders/new",
    }, unpaidOrderCancelledTemplate({
      subject: `Your bag of ${Number(group.item_count)} ${Number(group.item_count) === 1 ? "item" : "items"}`,
      amountGhs: Number(group.total_pesewas) / 100,
      ttlHours: timeouts.unpaidOrderTtlHours,
      shopUrl: `${env.app.url}/app/orders/new`,
    }), now);
  }

  // Then single orders that were never part of a bag.
  const { data: orderRows, error: orderError } = await admin
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .is("order_group_id", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(PAYMENT_RECONCILIATION.orderBatchSize);
  if (orderError) throw new Error(`reconcile-payments: could not list pending orders: ${orderError.message}`);

  for (const order of (orderRows ?? []) as Order[]) {
    if (await findActivePayment(admin, { orderId: order.id })) continue;
    if (!(await cancelOrderUnpaid(admin, order, timeouts, now, null))) continue;
    orders += 1;

    const amountGhs = Number(order.admin_total_ghs ?? order.pricing?.total_ghs ?? 0);
    await notify(order.user_id, "order_expired_unpaid", {
      order_id: order.id,
      product_name: order.product_name,
      amount_ghs: amountGhs,
      href: "/app/orders/new",
    }, unpaidOrderCancelledTemplate({
      subject: order.product_name,
      amountGhs,
      ttlHours: timeouts.unpaidOrderTtlHours,
      shopUrl: `${env.app.url}/app/orders/new`,
    }), now);
  }

  return { orders, groups };
}

/** Guarded `pending → cancelled` for one order, with its audit row and timeline event. */
async function cancelOrderUnpaid(
  admin: SupabaseClient,
  order: Order,
  timeouts: PaymentTimeouts,
  now: Date,
  groupId: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`reconcile-payments: could not cancel order ${order.id}: ${error.message}`);
  if (!data || data.length === 0) return false;

  await logAuditEvent({
    actorId: order.user_id,
    actorRole: "system",
    action: "order_expired_unpaid",
    entityType: "order",
    entityId: order.id,
    metadata: { from: "pending", to: "cancelled", ttlHours: timeouts.unpaidOrderTtlHours, orderGroupId: groupId },
  });

  await recordOrderEvent({
    order_id: order.id,
    order_group_id: groupId,
    kind: "cancelled",
    title: "Closed: not paid in time",
    detail: `No payment arrived within ${timeouts.unpaidOrderTtlHours} hours`,
    occurred_at: now.toISOString(),
  });
  return true;
}

// ── Notification (row first, then the mail) ─────────────────────────────────

/**
 * Same order of writes as `notifyPriceDrop`: the `notifications` row is the
 * durable fact that the customer is owed this message; whether Resend accepted
 * it is a second fact. Never throws for a delivery problem, because a mailbox
 * must not stop a money reconciliation. A missing table still propagates.
 */
async function notify(
  userId: string,
  event: "payment_expired" | "order_expired_unpaid",
  payload: Record<string, unknown>,
  template: { subject: string; html: string },
  now: Date,
): Promise<void> {
  let notificationId: string | null = null;
  try {
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
    logger.error("reconcile-payments: notification failed", {
      userId, event, notificationId, error: error instanceof Error ? error.message : String(error),
    });
    if (notificationId) {
      await markNotificationDelivered(notificationId, { status: "failed" }).catch(() => undefined);
    }
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function minutesBefore(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function orderIdOf(payment: Payment): string | null {
  const id = (payment.metadata as Record<string, unknown> | null)?.order_id;
  return typeof id === "string" ? id : null;
}
