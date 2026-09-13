import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { Payment } from "@/features/payments/types";
import type { Order } from "@/features/orders/types";
import {
  getOrderById,
  linkOrderToPayment,
  sendOrderStatusEmail,
} from "@/features/orders/services/orders.service";
import { listOrdersByGroup } from "@/db/queries/orders";
import { getOrderGroupById, updateOrderGroupStatus } from "@/db/queries/order-groups";
import { getPaymentChannel } from "@/features/payments/services/payment-channels.service";
import {
  initializeTransaction,
  verifyTransaction,
  generatePaymentReference,
} from "@/lib/paystack/client";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createOrderNotifications } from "@/features/notifications/services/notifications.service";
import { env } from "@/lib/env";
import { PAYMENT_STATUSES } from "@/config/constants";
import type { PlatformUser } from "@/features/users/types";
import type {
  InitializePaymentResponse,
  PaymentChannel,
  PaymentInsert,
  PaymentResponse,
} from "@/features/payments/types";
import type { InitializePaymentInput } from "@/features/payments/schema";

// ── DB queries ────────────────────────────────────────────────────────────────


async function insertPayment(
  client: SupabaseClient,
  payment: PaymentInsert
): Promise<Payment | null> {
  const { data, error } = await client
    .from("payments")
    .insert(payment)
    .select()
    .single();

  if (error) {
    logger.error("insertPayment failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as Payment;
}

async function getPaymentByReference(
  client: SupabaseClient,
  reference: string
): Promise<Payment | null> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .single();

  if (error) return null;
  return data as Payment;
}

async function getPaymentsByUserId(
  client: SupabaseClient,
  userId: string
): Promise<Payment[]> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getPaymentsByUserId failed", { userId, error: error.message });
    return [];
  }
  return (data ?? []) as Payment[];
}

/** What a charge is for: one legacy order, or one bag's order group. */
type ChargeTarget = { orderId: string; groupId?: never } | { groupId: string; orderId?: never };

/**
 * The newest payment that already has a claim on this target — pending or
 * successful.
 *
 * One query for both shapes. They differ only in how the payment names its
 * target: a legacy order is reachable only through `metadata->>order_id`
 * (there was never a column), while a group has the real `order_group_id`
 * column 048 added. Everything else — the status filter, the ordering, the
 * limit — is the same guard, and the two copies of it drifted apart once
 * already.
 */
async function findActivePayment(client: SupabaseClient, target: ChargeTarget): Promise<Payment | null> {
  const base = client.from("payments").select("*");
  const scoped =
    target.groupId != null
      ? base.eq("order_group_id", target.groupId)
      : base.filter("metadata->>order_id", "eq", target.orderId);

  const { data } = await scoped
    .in("status", [PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.SUCCESS])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as Payment | null;
}

/**
 * Refuse to open a second transaction for something already being paid for.
 *
 * `noun` is the customer-facing word for the target ("order" / "bag") so the
 * two callers share the guard without sharing the wording — a customer paying
 * for a bag should not be told about an "order" they never made.
 */
async function assertNoActivePayment(client: SupabaseClient, target: ChargeTarget, noun: string): Promise<void> {
  const existing = await findActivePayment(client, target);
  if (!existing) return;
  if (existing.status === PAYMENT_STATUSES.SUCCESS) {
    throw new APIError(409, `This ${noun} has already been paid.`);
  }
  throw new APIError(409, `A payment is already in progress for this ${noun}.`);
}

async function getAllPayments(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string }
): Promise<Payment[]> {
  let query = client
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.userId) query = query.eq("user_id", filters.userId);

  const { data, error } = await query;

  if (error) {
    logger.error("getAllPayments failed", { error: error.message });
    return [];
  }
  return (data ?? []) as Payment[];
}

/**
 * Move a payment from one status to another, atomically.
 *
 * The `.eq("status", fromStatus)` guard is what makes the money path idempotent.
 * Paystack reports the same charge twice — once when it redirects the customer's
 * browser back, once over the webhook — and the two arrive concurrently. Both can
 * read a pending payment and both can verify it successfully; only the update that
 * actually matches a still-pending row comes back with data. The loser gets null
 * and must skip the follow-on effects rather than repeat them.
 *
 * Returns null ONLY when no row matched, i.e. this caller lost the race. A real
 * database failure throws instead: the two are not interchangeable, because
 * treating a failed write as "someone else won" would report the payment as
 * settled to the customer while the order silently stayed unpaid.
 */
async function transitionPaymentStatus(
  client: SupabaseClient,
  paymentId: string,
  fromStatus: string,
  toStatus: string,
  metadata?: Record<string, unknown>,
  channel?: string
): Promise<Payment | null> {
  const update: Record<string, unknown> = { status: toStatus };
  if (metadata) update.metadata = metadata;
  if (channel) update.channel = channel;

  const { data, error } = await client
    .from("payments")
    .update(update)
    .eq("id", paymentId)
    .eq("status", fromStatus)
    .select()
    .maybeSingle();

  if (error) {
    logger.error("transitionPaymentStatus failed", {
      paymentId,
      fromStatus,
      toStatus,
      code: error.code,
      message: error.message,
    });
    throw new APIError(502, "Could not record the payment result");
  }
  return data as Payment | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    id: payment.id,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    channel: payment.channel ?? null,
    createdAt: payment.created_at,
  };
}

function orderIdOf(payment: Payment): string | null {
  const orderId = (payment.metadata as Record<string, unknown> | null)?.order_id;
  return typeof orderId === "string" ? orderId : null;
}

/** What a payment buys: one legacy order, or a bag's order group. */
interface PayTarget {
  orderId: string | null;
  groupId: string | null;
}

function targetOf(payment: Payment): PayTarget {
  return { orderId: orderIdOf(payment), groupId: payment.order_group_id ?? null };
}

const NO_TARGET: PayTarget = { orderId: null, groupId: null };

/**
 * Where to send the customer back to after Paystack.
 *
 * These must resolve to routes that actually exist — the customer's orders live
 * under /app/orders, and a redirect to a non-existent path turns a declined card
 * into a 404 with no explanation of what happened to their money.
 *
 * A group's failure lands on the bag, where the customer retries: the cart is
 * already `checked_out`, so the bag reads empty and shows the pending-group
 * card. A legacy order's failure lands on that order's detail page.
 */
function successUrl(target: PayTarget): string {
  if (target.groupId) return `${env.app.url}/app/orders?payment=success&group=${target.groupId}`;
  return target.orderId
    ? `${env.app.url}/app/orders/${target.orderId}?payment=success`
    : `${env.app.url}/app/orders?payment=success`;
}

function failureUrl(
  target: PayTarget,
  reason: "failed" | "error" = "failed"
): string {
  if (target.groupId) return `${env.app.url}/app/bag?payment=${reason}`;
  // The per-order checkout SCREEN is gone (F5) — the order detail page absorbed
  // its one job. A legacy order's failure therefore lands on the order itself,
  // which renders the notice and offers the retry.
  return target.orderId
    ? `${env.app.url}/app/orders/${target.orderId}?payment=${reason}`
    : `${env.app.url}/app/orders?payment=${reason}`;
}

/**
 * Where to send a customer whose return from Paystack could not be resolved to a
 * payment at all — an unparseable reference, or a failure before we knew which
 * order they were paying for.
 */
export function unresolvedPaymentUrl(): string {
  return failureUrl(NO_TARGET, "error");
}

// ── Service functions ─────────────────────────────────────────────────────────

/** One transaction for one order (legacy) or one order group (the bag). */
export async function initializePayment(
  user: PlatformUser,
  input: InitializePaymentInput,
): Promise<InitializePaymentResponse> {
  const admin = createAdminClient();

  // Paystack keys the transaction on the customer's email, and PlatformUser
  // inherits an optional email from Supabase's User. Refuse explicitly rather
  // than failing inside the Paystack call with a payment row already written.
  if (!user.email) {
    throw new APIError(400, "Your account has no email address. Please contact support.");
  }

  const charge = input.orderGroupId
    ? await groupCharge(admin, user, input.orderGroupId, input.channel)
    : await orderCharge(admin, user, input.orderId!);

  const reference = generatePaymentReference();
  const payment = await insertPayment(admin, {
    user_id: user.id,
    reference,
    amount: charge.amountPesewas,
    currency: "GHS",
    status: PAYMENT_STATUSES.PENDING,
    metadata: charge.metadata,
    ...(charge.target.groupId && { order_group_id: charge.target.groupId }),
  });

  if (!payment) {
    throw new APIError(500, "Failed to create payment");
  }

  let authorizationUrl: string;
  try {
    const callbackUrl = `${env.app.url}/api/payments/callback`;
    const paystackResponse = await initializeTransaction({
      email: user.email,
      amount: charge.amountPesewas,
      reference,
      callbackUrl,
      channels: charge.channels,
      ...(charge.paystackMetadata && { metadata: charge.paystackMetadata }),
    });
    authorizationUrl = paystackResponse.data.authorization_url;
  } catch (error) {
    // Best effort: if this write also fails, the Paystack error below is the
    // more useful thing to report, so swallow rather than mask it. The payment
    // is left pending and the customer's retry is blocked by R2 until it is
    // reconciled — logged loudly for that reason.
    await transitionPaymentStatus(
      admin,
      payment.id,
      PAYMENT_STATUSES.PENDING,
      PAYMENT_STATUSES.FAILED,
      { ...charge.metadata, error: "Paystack initialization failed" },
    ).catch((markError: unknown) => {
      logger.error("Could not mark payment failed after Paystack error", {
        paymentId: payment.id,
        reference,
        error: markError instanceof Error ? markError.message : String(markError),
      });
    });

    logger.error("Paystack initializeTransaction failed", {
      reference,
      ...charge.target,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new APIError(502, "Payment provider error. Please try again.");
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "payment_initialized",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      ...(charge.target.groupId ? { orderGroupId: charge.target.groupId } : { orderId: charge.target.orderId }),
      reference,
      amount: charge.amountPesewas,
      channel: charge.channels,
    },
  });

  return { payment: toPaymentResponse(payment), authorizationUrl };
}

/** Everything the Paystack call and the payment row need, decided server-side. */
interface Charge {
  target: PayTarget;
  amountPesewas: number;
  channels: string[];
  metadata: Record<string, unknown>;
  paystackMetadata: Record<string, unknown> | null;
}

const DEFAULT_CHANNELS = ["card", "mobile_money"];

async function orderCharge(admin: SupabaseClient, user: PlatformUser, orderId: string): Promise<Charge> {
  const order = await getOrderById(admin, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.user_id !== user.id) throw new APIError(404, "Order not found");
  if (order.status !== "pending") throw new APIError(400, "Order is not awaiting payment");
  // A bag's orders are paid once, as a group: charging one line on its own would
  // split the total and leave the group half-paid. The old order-detail page
  // still links to the per-order checkout, so this is enforced here, not there.
  if (order.order_group_id) throw new APIError(400, "This item is part of a bag. Pay for the bag as one.");

  await assertNoActivePayment(admin, { orderId }, "order");

  // Use admin-set price if available, otherwise use calculated pricing
  const totalGhs = order.admin_total_ghs ?? order.pricing.total_ghs;
  if (!totalGhs || totalGhs <= 0) {
    throw new APIError(400, "Order pricing has not been determined yet. Please wait for admin review.");
  }
  return {
    target: { orderId, groupId: null },
    amountPesewas: Math.round(totalGhs * 100),
    channels: DEFAULT_CHANNELS,
    metadata: { order_id: orderId },
    paystackMetadata: null,
  };
}

async function groupCharge(admin: SupabaseClient, user: PlatformUser, groupId: string, channelId?: string): Promise<Charge> {
  const group = await getOrderGroupById(groupId);
  if (!group || group.user_id !== user.id) throw new APIError(404, "Order group not found");
  if (group.status === "paid") throw new APIError(400, "This bag has already been paid");
  if (group.status !== "pending") throw new APIError(400, "This bag is not awaiting payment");

  await assertNoActivePayment(admin, { groupId }, "bag");

  // The amount is the group's own column, struck at checkout — never re-read from the bag.
  if (!(group.total_pesewas > 0)) throw new APIError(400, "This bag has nothing to pay for");

  let channel: PaymentChannel | null = null;
  if (channelId) {
    channel = await getPaymentChannel(channelId);
    if (!channel) throw new APIError(400, "Choose a payment method");
  }

  const orderIds = (await listOrdersByGroup(admin, groupId)).map((o) => o.id);
  const ids = { order_group_id: groupId, order_ids: orderIds };
  return {
    target: { orderId: null, groupId },
    amountPesewas: group.total_pesewas,
    channels: channel ? [channel.paystack_channel] : DEFAULT_CHANNELS,
    metadata: { ...ids, requested_channel: channel?.id ?? null, provider: channel?.provider ?? null },
    paystackMetadata: ids,
  };
}

export async function handlePaymentCallback(
  reference: string,
): Promise<{ redirectUrl: string }> {
  const admin = createAdminClient();

  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Payment callback for unknown reference", { reference });
    throw new APIError(404, "Payment not found");
  }

  const target = targetOf(payment);
  const { orderId } = target;

  // Already finalized — by the other delivery channel, or by an earlier attempt.
  // Report the outcome; never re-run the effects.
  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { redirectUrl: successUrl(target) };
  }
  if (payment.status === PAYMENT_STATUSES.FAILED) {
    return { redirectUrl: failureUrl(target) };
  }

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(reference);
  } catch (error) {
    logger.error("Paystack verification failed", {
      reference,
      error: error instanceof Error ? error.message : String(error),
    });
    // Transient: leave the payment pending so the webhook retry can finish it.
    throw new APIError(502, "Payment verification failed");
  }

  const paystackStatus = verification.data.status;
  const verifyData = verification.data as unknown as Record<string, unknown>;
  // Merge rather than replace — the order_id written at initialization is the
  // only link from a payment back to its order.
  const baseMetadata = (payment.metadata as Record<string, unknown> | null) ?? {};

  // A charge only counts if Paystack says it succeeded AND it is the charge we
  // asked for. Without the amount and currency comparison, an underpaid or
  // wrong-currency charge would silently promote the order to paid.
  const amountMatches = verification.data.amount === payment.amount;
  const currencyMatches = verification.data.currency === payment.currency;
  const isSuccess = paystackStatus === "success" && amountMatches && currencyMatches;

  if (paystackStatus === "success" && !isSuccess) {
    logger.error("Paystack verification mismatch — refusing to mark paid", {
      reference,
      ...target,
      expectedAmount: payment.amount,
      actualAmount: verification.data.amount,
      expectedCurrency: payment.currency,
      actualCurrency: verification.data.currency,
    });
  }

  if (isSuccess) {
    const claimed = await transitionPaymentStatus(
      admin,
      payment.id,
      PAYMENT_STATUSES.PENDING,
      PAYMENT_STATUSES.SUCCESS,
      { ...baseMetadata, paystack_verification: verifyData },
      verification.data.channel,
    );

    // Lost the race to the other delivery channel — it owns the side effects.
    if (!claimed) {
      return { redirectUrl: successUrl(target) };
    }

    if (target.groupId) {
      await settleGroup(admin, payment, target.groupId);
    } else if (orderId) {
      const order = await settleOrder(admin, payment, orderId);
      // One order, one email — the group path sends its own.
      if (order) sendOrderStatusEmail(payment.user_id, order, "paid");
    }

    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: "payment_successful",
      entityType: "payment",
      entityId: payment.id,
      metadata: { reference, ...target },
    });

    return { redirectUrl: successUrl(target) };
  }

  const failed = await transitionPaymentStatus(
    admin,
    payment.id,
    PAYMENT_STATUSES.PENDING,
    PAYMENT_STATUSES.FAILED,
    { ...baseMetadata, paystack_verification: verifyData },
  );

  // Lost the race to the other delivery channel — it owns the audit trail.
  if (!failed) {
    return { redirectUrl: failureUrl(target) };
  }

  // A failed group payment leaves the group pending: the customer retries from
  // the bag with a fresh transaction. Nothing is cancelled here.
  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: "system",
    action: "payment_failed",
    entityType: "payment",
    entityId: payment.id,
    metadata: { reference, ...target, paystackStatus, amountMatches, currencyMatches },
  });

  return { redirectUrl: failureUrl(target) };
}

/**
 * pending → paid for one order. Null when the order had already flipped (the
 * status guard in `linkOrderToPayment` matched nothing) — then no audit row, no
 * notification, so a re-run of the fan-out never repeats an effect.
 */
async function settleOrder(admin: SupabaseClient, payment: Payment, orderId: string): Promise<Order | null> {
  const order = await linkOrderToPayment(admin, orderId, payment.id);
  if (!order) return null;

  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: "system",
    action: "order_status_changed",
    entityType: "order",
    entityId: orderId,
    metadata: { from: "pending", to: "paid", paymentId: payment.id, orderGroupId: payment.order_group_id ?? null },
  });
  await createOrderNotifications(
    payment.user_id,
    orderId,
    order.product_name,
    order.admin_total_ghs ?? order.pricing.total_ghs,
  );
  return order;
}

/**
 * Fan `paid` out over every order in the group, then flip the group itself.
 * Each step is guarded on its own current status, so a second pass (a webhook
 * after a callback that died halfway) finishes what is left and repeats nothing.
 */
async function settleGroup(admin: SupabaseClient, payment: Payment, groupId: string): Promise<void> {
  const orders = await listOrdersByGroup(admin, groupId);
  let first: Order | null = null;
  for (const order of orders) {
    const settled = await settleOrder(admin, payment, order.id);
    if (settled) first ??= settled;
  }

  const flipped = await updateOrderGroupStatus(groupId, "pending", "paid", { payment_id: payment.id });
  if (flipped) {
    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: "order_group_paid",
      entityType: "order_group",
      entityId: groupId,
      metadata: { paymentId: payment.id, order_ids: orders.map((o) => o.id) },
    });
  }

  // One email per group. A group template is Phase 5+; until then the first
  // order's "paid" mail stands in for the whole bag.
  if (first) sendOrderStatusEmail(payment.user_id, first, "paid");
}

/**
 * Handle a verified Paystack webhook delivery.
 *
 * Retry contract: returning normally tells the route to answer 2xx and Paystack
 * stops redelivering. That is what we want for anything we have deliberately
 * declined — an event type we do not handle, a reference we do not recognize,
 * a charge already finalized — since redelivering those can never change the
 * outcome. Throwing propagates to the route as a non-2xx so Paystack retries,
 * and is reserved for transient faults (a failed verification call) where a
 * later attempt can still succeed.
 */
export async function handleWebhookEvent(event: {
  event: string;
  data: { reference: string; status: string; amount: number; currency: string };
}): Promise<{ message: string }> {
  if (event.event !== "charge.success") {
    return { message: "Event ignored" };
  }

  const { reference } = event.data;
  const admin = createAdminClient();

  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Webhook for unknown payment reference", { reference });
    return { message: "Payment not found, ignored" };
  }

  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { message: "Already processed" };
  }

  try {
    await handlePaymentCallback(reference);
  } catch (err) {
    logger.error("Webhook handlePaymentCallback failed", {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return { message: "Webhook processed" };
}

export interface TransactionListResponse {
  transactions: PaymentResponse[];
  count: number;
}

export async function listUserTransactions(
  client: SupabaseClient,
  user: PlatformUser,
): Promise<TransactionListResponse> {
  const payments = await getPaymentsByUserId(client, user.id);
  return {
    transactions: payments.map(toPaymentResponse),
    count: payments.length,
  };
}

export async function listAllTransactions(
  client: SupabaseClient,
  user: PlatformUser,
  filters?: { status?: string; userId?: string },
): Promise<TransactionListResponse> {
  if (user.profile.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const payments = await getAllPayments(client, filters);
  return {
    transactions: payments.map(toPaymentResponse),
    count: payments.length,
  };
}
