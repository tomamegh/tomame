import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { DbPayment } from "@/types/db";
import {
  getOrderById,
  linkOrderToPayment,
} from "@/features/orders/services/orders.service";
import {
  initializeTransaction,
  verifyTransaction,
  generatePaymentReference,
} from "@/lib/paystack/client";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { env } from "@/lib/env";
import { PAYMENT_STATUSES } from "@/config/constants";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type {
  InitializePaymentResponse,
  PaymentResponse,
} from "@/features/payments/types";

// ── DB queries ────────────────────────────────────────────────────────────────

interface PaymentInsert {
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, unknown> | null;
}

async function insertPayment(
  client: SupabaseClient,
  payment: PaymentInsert
): Promise<DbPayment | null> {
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
  return data as DbPayment;
}

async function getPaymentByReference(
  client: SupabaseClient,
  reference: string
): Promise<DbPayment | null> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .single();

  if (error) return null;
  return data as DbPayment;
}

async function getPaymentsByUserId(
  client: SupabaseClient,
  userId: string
): Promise<DbPayment[]> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getPaymentsByUserId failed", { userId, error: error.message });
    return [];
  }
  return (data ?? []) as DbPayment[];
}

async function getAllPayments(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string }
): Promise<DbPayment[]> {
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
  return (data ?? []) as DbPayment[];
}

async function updatePaymentStatus(
  client: SupabaseClient,
  paymentId: string,
  status: string,
  metadata?: Record<string, unknown>
): Promise<DbPayment | null> {
  const update: Record<string, unknown> = { status };
  if (metadata) {
    update.metadata = metadata;
  }

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
  return data as DbPayment;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPaymentResponse(payment: DbPayment): PaymentResponse {
  return {
    id: payment.id,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.created_at,
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Initialize a payment for an order.
 * Uses admin client internally — reads order, creates payment record, and
 * may roll back on failure. No RLS-friendly single-user operation here.
 */
export async function initializePayment(
  user: AuthenticatedUser,
  orderId: string,
): Promise<ServiceResult<InitializePaymentResponse>> {
  const admin = createAdminClient();

  const order = await getOrderById(admin, orderId);
  if (!order) {
    return { success: false, error: "Order not found", status: 404 };
  }
  if (order.user_id !== user.id) {
    return { success: false, error: "Order not found", status: 404 };
  }
  if (order.status !== "pending") {
    return { success: false, error: "Order is not awaiting payment", status: 400 };
  }

  const totalPesewas = order.pricing.total_pesewas;
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
    return { success: false, error: "Failed to create payment", status: 500 };
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
    await updatePaymentStatus(admin, payment.id, PAYMENT_STATUSES.FAILED, {
      error: "Paystack initialization failed",
    });
    logger.error("Paystack initializeTransaction failed", {
      reference,
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "Payment provider error. Please try again.",
      status: 502,
    };
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "payment_initialized",
    entityType: "payment",
    entityId: payment.id,
    metadata: { orderId, reference, amount: totalPesewas },
  });

  return {
    success: true,
    data: { payment: toPaymentResponse(payment), authorizationUrl },
  };
}

/**
 * Handle the Paystack callback redirect.
 * No user session — uses admin client internally.
 */
export async function handlePaymentCallback(
  reference: string,
): Promise<ServiceResult<{ redirectUrl: string }>> {
  const admin = createAdminClient();

  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Payment callback for unknown reference", { reference });
    return { success: false, error: "Payment not found", status: 404 };
  }

  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { success: true, data: { redirectUrl: `${env.app.url}/orders?payment=success` } };
  }
  if (payment.status === PAYMENT_STATUSES.FAILED) {
    return { success: true, data: { redirectUrl: `${env.app.url}/orders?payment=failed` } };
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
    return { success: false, error: "Payment verification failed", status: 502 };
  }

  const orderId = (payment.metadata as Record<string, unknown>)?.order_id as string;

  if (paystackStatus === "success") {
    await updatePaymentStatus(admin, payment.id, PAYMENT_STATUSES.SUCCESS, {
      paystack_verification: verifyData,
    });

    if (orderId) {
      await linkOrderToPayment(admin, orderId, payment.id);

      await logAuditEvent({
        actorId: payment.user_id,
        actorRole: "system",
        action: "order_status_changed",
        entityType: "order",
        entityId: orderId,
        metadata: { from: "pending", to: "paid", paymentId: payment.id },
      });
    }

    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: "payment_successful",
      entityType: "payment",
      entityId: payment.id,
      metadata: { reference, orderId },
    });

    return { success: true, data: { redirectUrl: `${env.app.url}/orders?payment=success` } };
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

  return { success: true, data: { redirectUrl: `${env.app.url}/orders?payment=failed` } };
}

/**
 * Handle Paystack webhook event. Idempotent.
 * No user session — uses admin client internally.
 */
export async function handleWebhookEvent(event: {
  event: string;
  data: { reference: string; status: string; amount: number; currency: string };
}): Promise<ServiceResult<{ message: string }>> {
  if (event.event !== "charge.success") {
    return { success: true, data: { message: "Event ignored" } };
  }

  const { reference } = event.data;
  const admin = createAdminClient();

  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Webhook for unknown payment reference", { reference });
    return { success: true, data: { message: "Payment not found, ignored" } };
  }

  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { success: true, data: { message: "Already processed" } };
  }

  const result = await handlePaymentCallback(reference);
  if (!result.success) {
    return { success: false, error: result.error, status: result.status };
  }

  return { success: true, data: { message: "Webhook processed" } };
}

export interface TransactionListResponse {
  transactions: PaymentResponse[];
  count: number;
}

/**
 * List payment transactions for the authenticated user.
 * Pass createClient() — RLS ensures users only see their own payments.
 */
export async function listUserTransactions(
  client: SupabaseClient,
  user: AuthenticatedUser,
): Promise<ServiceResult<TransactionListResponse>> {
  const payments = await getPaymentsByUserId(client, user.id);

  return {
    success: true,
    data: { transactions: payments.map(toPaymentResponse), count: payments.length },
  };
}

/**
 * Admin: list all transactions with optional filters.
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function listAllTransactions(
  client: SupabaseClient,
  user: AuthenticatedUser,
  filters?: { status?: string; userId?: string },
): Promise<ServiceResult<TransactionListResponse>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const payments = await getAllPayments(client, filters);

  return {
    success: true,
    data: { transactions: payments.map(toPaymentResponse), count: payments.length },
  };
}
