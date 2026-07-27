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
  receiveMobileMoney,
  getTransactionStatus,
  generatePaymentReference,
  normalizeMsisdn,
  pesewasToGhs,
  type HubtelChannel,
} from "@/lib/hubtel/client";
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
  channel?: string,
  providerTransactionId?: string | null,
): Promise<Payment | null> {
  const update: Record<string, unknown> = { status };
  if (metadata) update.metadata = metadata;
  if (channel) update.channel = channel;
  if (providerTransactionId) {
    update.provider_transaction_id = providerTransactionId;
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
  return data as Payment;
}

/**
 * Move a payment out of `pending` atomically.
 *
 * The `.eq("status", "pending")` predicate makes this a compare-and-swap: the
 * database, not the application, decides which caller wins. Hubtel's callback
 * and the customer's status poll routinely race on the same payment, and only
 * the winner may link the order, notify and email — otherwise the customer gets
 * duplicate mail and the audit log double-counts a single payment.
 *
 * Returns null when another caller already claimed the transition.
 */
async function claimPaymentTransition(
  client: SupabaseClient,
  paymentId: string,
  status: string,
  metadata: Record<string, unknown>,
  providerTransactionId?: string | null,
): Promise<Payment | null> {
  const update: Record<string, unknown> = { status, metadata };
  if (providerTransactionId) {
    update.provider_transaction_id = providerTransactionId;
  }

  const { data, error } = await client
    .from("payments")
    .update(update)
    .eq("id", paymentId)
    .eq("status", PAYMENT_STATUSES.PENDING)
    .select()
    .maybeSingle();

  if (error) {
    logger.error("claimPaymentTransition failed", {
      paymentId,
      status,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data) {
    logger.info("Payment transition already claimed by a concurrent settler", {
      paymentId,
      status,
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
    customerMsisdn: payment.customer_msisdn ?? null,
    createdAt: payment.created_at,
  };
}

/**
 * Merge into the existing metadata rather than overwriting it — `order_id` lives
 * there and the double-payment guard reads it back via `metadata->>order_id`.
 */
function mergeMetadata(
  payment: Payment,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(payment.metadata ?? {}), ...patch };
}

/**
 * A mobile money PIN prompt expires on the customer's handset after a few
 * minutes. Past this, a still-pending payment is treated as abandoned so the
 * customer can start a fresh attempt.
 */
const PROMPT_TTL_MS = 5 * 60 * 1000;

function isPromptExpired(payment: Payment): boolean {
  return Date.now() - new Date(payment.created_at).getTime() > PROMPT_TTL_MS;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Resolve a stale or already-settled payment attempt so the customer is not
 * locked out of retrying. Returns a payment only if it still blocks a new one.
 */
async function resolveActivePayment(
  admin: SupabaseClient,
  orderId: string,
): Promise<Payment | null> {
  const existing = await getActivePaymentForOrder(admin, orderId);
  if (!existing) return null;

  if (existing.status === PAYMENT_STATUSES.SUCCESS) return existing;

  // A pending attempt: ask Hubtel where it actually landed before blocking.
  const settled = await verifyAndSettlePayment(existing.reference);
  if (settled.status === PAYMENT_STATUSES.SUCCESS) return settled;
  if (settled.status === PAYMENT_STATUSES.FAILED) return null;

  // Still pending — block only while the handset prompt could still be live.
  if (isPromptExpired(existing)) {
    // Compare-and-swap, not a blind write: Hubtel said "pending" a moment ago,
    // but the customer may be approving the prompt right now. If a real
    // settlement lands first it wins and we keep blocking.
    const abandoned = await claimPaymentTransition(
      admin,
      existing.id,
      PAYMENT_STATUSES.FAILED,
      mergeMetadata(existing, { failure_reason: "prompt_expired" }),
    );
    if (!abandoned) {
      return (await getPaymentByReference(admin, existing.reference)) ?? existing;
    }
    return null;
  }
  return settled;
}

export async function initializePayment(
  user: PlatformUser,
  orderId: string,
  msisdnInput: string,
  channel: HubtelChannel,
): Promise<InitializePaymentResponse> {
  const admin = createAdminClient();

  const msisdn = normalizeMsisdn(msisdnInput);
  if (!msisdn) {
    throw new APIError(400, "Enter a valid Ghanaian mobile money number.");
  }

  const order = await getOrderById(admin, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.user_id !== user.id) throw new APIError(404, "Order not found");
  if (order.status !== "pending") throw new APIError(400, "Order is not awaiting payment");

  // Guard against double payment: block if a pending or successful payment already exists
  const blocking = await resolveActivePayment(admin, orderId);
  if (blocking) {
    if (blocking.status === PAYMENT_STATUSES.SUCCESS) {
      throw new APIError(409, "This order has already been paid.");
    }
    throw new APIError(
      409,
      "A payment prompt is already awaiting approval on your phone.",
    );
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
    channel,
    customer_msisdn: msisdn,
    metadata: { order_id: orderId },
  });

  if (!payment) {
    throw new APIError(500, "Failed to create payment");
  }

  // Hubtel bills in GHS decimals, not the pesewas we store.
  const charge = await receiveMobileMoney({
    amount: pesewasToGhs(totalPesewas),
    customerName:
      [user.profile.first_name, user.profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Tomame customer",
    customerEmail: user.email ?? "",
    customerMsisdn: msisdn,
    channel,
    description: `Tomame order ${order.product_name}`.slice(0, 100),
    clientReference: reference,
    primaryCallbackUrl: `${env.app.url}/api/payments/webhook/hubtel/${env.hubtel.callbackSecret}`,
  }).catch((error: unknown) => {
    logger.error("Hubtel receiveMobileMoney threw", {
      reference,
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!charge || charge.state === "failed") {
    await updatePaymentStatus(
      admin,
      payment.id,
      PAYMENT_STATUSES.FAILED,
      mergeMetadata(payment, {
        failure_reason: "hubtel_prompt_rejected",
        hubtel_initiate: charge?.raw ?? null,
      }),
    );
    logger.error("Hubtel prompt was not accepted", {
      reference,
      orderId,
      responseCode: charge?.responseCode,
      message: charge?.message,
    });
    throw new APIError(
      502,
      charge?.message?.trim()
        ? `Payment provider error: ${charge.message}`
        : "Payment provider error. Please try again.",
    );
  }

  // Stays pending either way: an immediate 0000 is still confirmed through the
  // status API below, never written straight from the initiate response.
  await updatePaymentStatus(
    admin,
    payment.id,
    PAYMENT_STATUSES.PENDING,
    mergeMetadata(payment, { hubtel_initiate: charge.raw }),
    undefined,
    charge.transactionId,
  );

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "payment_initialized",
    entityType: "payment",
    entityId: payment.id,
    metadata: { orderId, reference, amount: totalPesewas, channel, msisdn },
  });

  // If Hubtel already reported success, settle it now rather than making the
  // client poll for a result that is already known.
  if (charge.state === "success") {
    const settled = await verifyAndSettlePayment(reference);
    return {
      payment: toPaymentResponse(settled),
      status: settled.status,
      message: "Payment received.",
    };
  }

  return {
    payment: toPaymentResponse(payment),
    status: PAYMENT_STATUSES.PENDING,
    message: `Approve the payment prompt sent to ${msisdn}.`,
  };
}

/**
 * The single source of truth for settling a payment.
 *
 * Asks Hubtel's Transaction Status Check API where the money actually is, then
 * applies the result idempotently. Both the callback route and the client
 * polling endpoint go through here — neither is allowed to write a status from
 * data it was handed, because Hubtel callbacks are unsigned.
 */
export async function verifyAndSettlePayment(reference: string): Promise<Payment> {
  const admin = createAdminClient();

  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Settle requested for unknown payment reference", { reference });
    throw new APIError(404, "Payment not found");
  }

  // Terminal states are final — never re-open a settled payment.
  if (payment.status !== PAYMENT_STATUSES.PENDING) return payment;

  let status: Awaited<ReturnType<typeof getTransactionStatus>>;
  try {
    status = await getTransactionStatus(reference);
  } catch (error) {
    logger.error("Hubtel status check failed", {
      reference,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new APIError(502, "Payment verification failed");
  }

  const orderId = (payment.metadata as Record<string, unknown>)?.order_id as
    | string
    | undefined;

  if (status.state === "pending") return payment;

  if (status.state === "failed") {
    const failed = await claimPaymentTransition(
      admin,
      payment.id,
      PAYMENT_STATUSES.FAILED,
      mergeMetadata(payment, { hubtel_verification: status.raw }),
      status.transactionId,
    );

    // Lost the race — the winner already audited this transition.
    if (!failed) {
      return (await getPaymentByReference(admin, reference)) ?? payment;
    }

    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: "payment_failed",
      entityType: "payment",
      entityId: payment.id,
      metadata: { reference, orderId, responseCode: status.responseCode },
    });

    return failed;
  }

  // ── Success ────────────────────────────────────────────────────────────────

  // Never credit an order for less than it costs, whatever Hubtel reports.
  if (status.amount != null && Math.round(status.amount * 100) < payment.amount) {
    logger.error("Hubtel reported an underpayment", {
      reference,
      expectedPesewas: payment.amount,
      reportedGhs: status.amount,
    });
    await updatePaymentStatus(
      admin,
      payment.id,
      PAYMENT_STATUSES.FAILED,
      mergeMetadata(payment, {
        failure_reason: "amount_mismatch",
        hubtel_verification: status.raw,
      }),
    );

    await logAuditEvent({
      actorId: payment.user_id,
      actorRole: "system",
      action: "payment_failed",
      entityType: "payment",
      entityId: payment.id,
      metadata: { reference, orderId, reason: "amount_mismatch" },
    });

    throw new APIError(400, "Paid amount does not match the order total.");
  }

  const succeeded = await claimPaymentTransition(
    admin,
    payment.id,
    PAYMENT_STATUSES.SUCCESS,
    mergeMetadata(payment, { hubtel_verification: status.raw }),
    status.transactionId,
  );

  // Lost the race — the winner is linking the order and sending the mail.
  // Doing it again here is exactly the duplicate this guard exists to prevent.
  if (!succeeded) {
    return (await getPaymentByReference(admin, reference)) ?? payment;
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

  return succeeded;
}

/**
 * Poll target for the checkout screen while the customer approves the prompt.
 * Scoped to the caller — a user may only read their own payment.
 */
export async function getPaymentStatusForUser(
  user: PlatformUser,
  reference: string,
): Promise<{ payment: PaymentResponse; orderId: string | null }> {
  const admin = createAdminClient();

  const existing = await getPaymentByReference(admin, reference);
  if (!existing || existing.user_id !== user.id) {
    throw new APIError(404, "Payment not found");
  }

  const payment =
    existing.status === PAYMENT_STATUSES.PENDING
      ? await verifyAndSettlePayment(reference)
      : existing;

  const orderId =
    ((payment.metadata as Record<string, unknown>)?.order_id as string) ?? null;

  return { payment: toPaymentResponse(payment), orderId };
}

/**
 * Hubtel callback handler. The body tells us *which* transaction to look at and
 * nothing more — the status itself is always re-fetched from Hubtel.
 */
export async function handleHubtelCallback(payload: {
  ResponseCode?: string;
  Data?: { ClientReference?: string } | null;
}): Promise<{ message: string }> {
  const reference = payload.Data?.ClientReference;
  if (!reference) {
    logger.warn("Hubtel callback without a ClientReference");
    return { message: "Missing ClientReference, ignored" };
  }

  const admin = createAdminClient();
  const payment = await getPaymentByReference(admin, reference);
  if (!payment) {
    logger.warn("Hubtel callback for unknown payment reference", { reference });
    return { message: "Payment not found, ignored" };
  }

  if (payment.status === PAYMENT_STATUSES.SUCCESS) {
    return { message: "Already processed" };
  }

  // A payment we abandoned as expired can still be approved late on the
  // handset. Silently ignoring that callback would mean the customer is
  // charged for an order that never moves to `paid`, so confirm with Hubtel
  // and raise it for manual reconciliation rather than auto-crediting — by
  // now the customer may have retried and paid a second time.
  if (payment.status === PAYMENT_STATUSES.FAILED) {
    const status = await getTransactionStatus(reference).catch(() => null);
    if (status?.state === "success") {
      logger.error(
        "RECONCILE: Hubtel reports a payment paid that we recorded as failed",
        {
          reference,
          paymentId: payment.id,
          userId: payment.user_id,
          orderId: (payment.metadata as Record<string, unknown>)?.order_id,
          amountPesewas: payment.amount,
          hubtelTransactionId: status.transactionId,
        },
      );
      return { message: "Late payment flagged for reconciliation" };
    }
    return { message: "Already processed" };
  }

  await verifyAndSettlePayment(reference);
  return { message: "Callback processed" };
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
