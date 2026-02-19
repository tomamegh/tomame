import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  insertPayment,
  getPaymentByReference,
  updatePaymentStatus,
} from "@/features/payments/payments.queries";
import {
  getOrderById,
  linkOrderToPayment,
} from "@/features/orders/orders.queries";
import {
  initializeTransaction,
  verifyTransaction,
  generatePaymentReference,
} from "@/lib/paystack/client";
import { logAuditEvent } from "@/features/audit/audit.service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { PAYMENT_STATUSES } from "@/config/constants";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type {
  InitializePaymentResponse,
  PaymentResponse,
} from "@/types/api";
import type { DbPayment } from "@/types/db";

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

/**
 * Initialize a payment for an order.
 * Creates a payment record and returns the Paystack authorization URL.
 */
export async function initializePayment(
  user: AuthenticatedUser,
  orderId: string
): Promise<ServiceResult<InitializePaymentResponse>> {
  // 1. Verify order exists, belongs to user, and is pending
  const order = await getOrderById(supabaseAdmin, orderId);

  if (!order) {
    return { success: false, error: "Order not found", status: 404 };
  }

  if (order.user_id !== user.id) {
    return { success: false, error: "Order not found", status: 404 };
  }

  if (order.status !== "pending") {
    return {
      success: false,
      error: "Order is not awaiting payment",
      status: 400,
    };
  }

  // 2. Get total from server-calculated pricing (never from client)
  const totalPesewas = order.pricing.total_pesewas;

  // 3. Generate reference and create payment record
  const reference = generatePaymentReference();

  const payment = await insertPayment(supabaseAdmin, {
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

  // 4. Initialize Paystack transaction
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
    // Mark payment as failed if Paystack init fails
    await updatePaymentStatus(supabaseAdmin, payment.id, PAYMENT_STATUSES.FAILED, {
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

  // 5. Audit log
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
    data: {
      payment: toPaymentResponse(payment),
      authorizationUrl,
    },
  };
}

/**
 * Handle the Paystack callback redirect.
 * Verifies the transaction and updates payment + order status.
 * Returns the URL to redirect the user to.
 */
export async function handlePaymentCallback(
  reference: string
): Promise<ServiceResult<{ redirectUrl: string }>> {
  // 1. Get payment by reference
  const payment = await getPaymentByReference(supabaseAdmin, reference);

  if (!payment) {
    logger.warn("Payment callback for unknown reference", { reference });
    return { success: false, error: "Payment not found", status: 404 };
  }

  // 2. Idempotency — already processed
  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return {
      success: true,
      data: { redirectUrl: `${env.app.url}/orders?payment=success` },
    };
  }

  if (payment.status === PAYMENT_STATUSES.FAILED) {
    return {
      success: true,
      data: { redirectUrl: `${env.app.url}/orders?payment=failed` },
    };
  }

  // 3. Verify with Paystack
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
    return {
      success: false,
      error: "Payment verification failed",
      status: 502,
    };
  }

  const orderId = (payment.metadata as Record<string, unknown>)?.order_id as string;

  // 4. Process based on Paystack status
  if (paystackStatus === "success") {
    // Update payment → success
    await updatePaymentStatus(supabaseAdmin, payment.id, PAYMENT_STATUSES.SUCCESS, {
      paystack_verification: verifyData,
    });

    // Update order → paid and link payment
    if (orderId) {
      await linkOrderToPayment(supabaseAdmin, orderId, payment.id);

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

    return {
      success: true,
      data: { redirectUrl: `${env.app.url}/orders?payment=success` },
    };
  }

  // Payment failed or abandoned
  await updatePaymentStatus(supabaseAdmin, payment.id, PAYMENT_STATUSES.FAILED, {
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

  return {
    success: true,
    data: { redirectUrl: `${env.app.url}/orders?payment=failed` },
  };
}

/**
 * Handle Paystack webhook event.
 * Only processes charge.success events. Idempotent.
 */
export async function handleWebhookEvent(event: {
  event: string;
  data: { reference: string; status: string; amount: number; currency: string };
}): Promise<ServiceResult<{ message: string }>> {
  // Only process charge.success
  if (event.event !== "charge.success") {
    return { success: true, data: { message: "Event ignored" } };
  }

  const { reference } = event.data;

  // Get payment — check it exists
  const payment = await getPaymentByReference(supabaseAdmin, reference);

  if (!payment) {
    logger.warn("Webhook for unknown payment reference", { reference });
    return { success: true, data: { message: "Payment not found, ignored" } };
  }

  // Idempotency — already success, nothing to do
  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { success: true, data: { message: "Already processed" } };
  }

  // Delegate to callback handler for verification + state updates
  const result = await handlePaymentCallback(reference);

  if (!result.success) {
    return { success: false, error: result.error, status: result.status };
  }

  return { success: true, data: { message: "Webhook processed" } };
}
