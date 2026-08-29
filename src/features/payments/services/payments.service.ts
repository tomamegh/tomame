import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { Payment } from "@/features/payments/types";
import {
  getOrderById,
  linkOrderToPayment,
  sendOrderStatusEmail,
} from "@/features/orders/services/orders.service";
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
  PaymentInsert,
  PaymentResponse,
} from "@/features/payments/types";

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

async function getActivePaymentForOrder(
  client: SupabaseClient,
  orderId: string,
): Promise<Payment | null> {
  const { data } = await client
    .from("payments")
    .select("*")
    .filter("metadata->>order_id", "eq", orderId)
    .in("status", [PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.SUCCESS])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as Payment | null;
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

/**
 * Where to send the customer back to after Paystack.
 *
 * These must resolve to routes that actually exist — the customer's orders live
 * under /app/orders, and a redirect to a non-existent path turns a declined card
 * into a 404 with no explanation of what happened to their money.
 */
function successUrl(orderId: string | null): string {
  return orderId
    ? `${env.app.url}/app/orders/${orderId}?payment=success`
    : `${env.app.url}/app/orders?payment=success`;
}

function failureUrl(
  orderId: string | null,
  reason: "failed" | "error" = "failed"
): string {
  return orderId
    ? `${env.app.url}/app/orders/${orderId}/checkout?payment=${reason}`
    : `${env.app.url}/app/orders?payment=${reason}`;
}

/**
 * Where to send a customer whose return from Paystack could not be resolved to a
 * payment at all — an unparseable reference, or a failure before we knew which
 * order they were paying for.
 */
export function unresolvedPaymentUrl(): string {
  return failureUrl(null, "error");
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function initializePayment(
  user: PlatformUser,
  orderId: string,
): Promise<InitializePaymentResponse> {
  const admin = createAdminClient();

  // Paystack keys the transaction on the customer's email, and PlatformUser
  // inherits an optional email from Supabase's User. Refuse explicitly rather
  // than failing inside the Paystack call with a payment row already written.
  if (!user.email) {
    throw new APIError(400, "Your account has no email address. Please contact support.");
  }

  const order = await getOrderById(admin, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.user_id !== user.id) throw new APIError(404, "Order not found");
  if (order.status !== "pending") throw new APIError(400, "Order is not awaiting payment");

  // Guard against double payment: block if a pending or successful payment already exists
  const existingPayment = await getActivePaymentForOrder(admin, orderId);
  if (existingPayment) {
    if (existingPayment.status === PAYMENT_STATUSES.SUCCESS) {
      throw new APIError(409, "This order has already been paid.");
    }
    throw new APIError(409, "A payment is already in progress for this order.");
  }

  // Use admin-set price if available, otherwise use calculated pricing
  const totalGhs = order.admin_total_ghs ?? order.pricing.total_ghs;
  if (!totalGhs || totalGhs <= 0) {
    throw new APIError(400, "Order pricing has not been determined yet. Please wait for admin review.");
  }
  const totalPesewas = Math.round(totalGhs * 100);
  const reference = generatePaymentReference();

  const payment = await insertPayment(admin, {
    user_id: user.id,
    reference,
    amount: totalPesewas,
    currency: "GHS",
    status: PAYMENT_STATUSES.PENDING,
    metadata: { order_id: orderId },
  });

  if (!payment) {
    throw new APIError(500, "Failed to create payment");
  }

  let authorizationUrl: string;
  try {
    const callbackUrl = `${env.app.url}/api/payments/callback`;
    const paystackResponse = await initializeTransaction({
      email: user.email,
      amount: totalPesewas,
      reference,
      callbackUrl,
      channels: ["card", "mobile_money"],
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
      { order_id: orderId, error: "Paystack initialization failed" },
    ).catch((markError: unknown) => {
      logger.error("Could not mark payment failed after Paystack error", {
        paymentId: payment.id,
        reference,
        error: markError instanceof Error ? markError.message : String(markError),
      });
    });

    logger.error("Paystack initializeTransaction failed", {
      reference,
      orderId,
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
    metadata: { orderId, reference, amount: totalPesewas },
  });

  return { payment: toPaymentResponse(payment), authorizationUrl };
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

  const orderId = orderIdOf(payment);

  // Already finalized — by the other delivery channel, or by an earlier attempt.
  // Report the outcome; never re-run the effects.
  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { redirectUrl: successUrl(orderId) };
  }
  if (payment.status === PAYMENT_STATUSES.FAILED) {
    return { redirectUrl: failureUrl(orderId) };
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
      orderId,
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
      return { redirectUrl: successUrl(orderId) };
    }

    if (orderId) {
      const order = await linkOrderToPayment(admin, orderId, payment.id);

      await logAuditEvent({
        actorId: payment.user_id,
        actorRole: "system",
        action: "order_status_changed",
        entityType: "order",
        entityId: orderId,
        metadata: { from: "pending", to: "paid", paymentId: payment.id },
      });

      if (order) {
        await createOrderNotifications(
          payment.user_id,
          orderId,
          order.product_name,
          order.admin_total_ghs ?? order.pricing.total_ghs,
        );
        sendOrderStatusEmail(payment.user_id, order, "paid");
      }
    }

    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: "payment_successful",
      entityType: "payment",
      entityId: payment.id,
      metadata: { reference, orderId },
    });

    return { redirectUrl: successUrl(orderId) };
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
    return { redirectUrl: failureUrl(orderId) };
  }

  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: "system",
    action: "payment_failed",
    entityType: "payment",
    entityId: payment.id,
    metadata: { reference, orderId, paystackStatus, amountMatches, currencyMatches },
  });

  return { redirectUrl: failureUrl(orderId) };
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
