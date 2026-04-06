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

async function updatePaymentStatus(
  client: SupabaseClient,
  paymentId: string,
  status: string,
  metadata?: Record<string, unknown>,
  channel?: string
): Promise<Payment | null> {
  const update: Record<string, unknown> = { status };
  if (metadata) update.metadata = metadata;
  if (channel) update.channel = channel;

  const { data, error } = await client
    .from("payments")
    .update(update)
    .eq("id", paymentId)
    .select()
    .single();

  if (error) {
    logger.error("updatePaymentStatus failed", {
      paymentId,
      status,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as Payment;
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

// ── Service functions ─────────────────────────────────────────────────────────

export async function initializePayment(
  user: PlatformUser,
  orderId: string,
): Promise<InitializePaymentResponse> {
  const admin = createAdminClient();

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
      //TODO: Fix user email in transaction initialization
      email: user.email!,
      amount: totalPesewas,
      reference,
      callbackUrl,
      channels: ["card", "mobile_money"],
    });
    authorizationUrl = paystackResponse.data.authorization_url;
  } catch (error) {
    await updatePaymentStatus(admin, payment.id, PAYMENT_STATUSES.FAILED, {
      error: "Paystack initialization failed",
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

  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { redirectUrl: `${env.app.url}/orders?payment=success` };
  }
  if (payment.status === PAYMENT_STATUSES.FAILED) {
    return { redirectUrl: `${env.app.url}/orders?payment=failed` };
  }

  let paystackStatus: string;
  let verifyData: Record<string, unknown>;
  try {
    const verification = await verifyTransaction(reference);
    paystackStatus = verification.data.status;
    verifyData = verification.data as unknown as Record<string, unknown>;
  } catch (error) {
    logger.error("Paystack verification failed", {
      reference,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new APIError(502, "Payment verification failed");
  }

  const orderId = (payment.metadata as Record<string, unknown>)?.order_id as string;

  if (paystackStatus === "success") {
    const paystackChannel = verifyData.channel as string | undefined;
    await updatePaymentStatus(
      admin,
      payment.id,
      PAYMENT_STATUSES.SUCCESS,
      { paystack_verification: verifyData },
      paystackChannel,
    );

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

    return { redirectUrl: `${env.app.url}/app/orders/${orderId}?payment=success` };
  }

  await updatePaymentStatus(admin, payment.id, PAYMENT_STATUSES.FAILED, {
    paystack_verification: verifyData,
  });

  await logAuditEvent({
    actorId: payment.user_id,
    actorRole: "system",
    action: "payment_failed",
    entityType: "payment",
    entityId: payment.id,
    metadata: { reference, orderId, paystackStatus },
  });

  return { redirectUrl: `${env.app.url}/orders?payment=failed` };
}

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
