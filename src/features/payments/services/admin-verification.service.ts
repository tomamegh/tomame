import "server-only";

import { AUDIT_ACTOR_ROLES } from "@/config/constants";
import { getRecipientEmail } from "@/db/queries/notifications";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { handlePaymentCallback } from "@/features/payments/services/payments.service";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { verifyTransaction } from "@/lib/paystack/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Did this actually go through?" — asked without changing anything.
 *
 * WHY THIS EXISTS ALONGSIDE SYNC. `syncTransactionStatus` is a repair: it
 * verifies and then runs the whole payment callback, linking orders, sending
 * mail and writing audit rows. It also refuses to call Paystack at all once a
 * payment is settled, on the reasonable grounds that there is nothing left to
 * repair. But the question an admin actually arrives with — a customer saying
 * they were debited, a charge that looks wrong — needs an answer for settled
 * payments too, and it must not have side effects: nobody wants to re-send a
 * receipt because they wanted to check a figure.
 *
 * So this reads. It asks Paystack about the reference and reports what came
 * back next to what we hold, and it writes nothing — not the payment row, not
 * the metadata, not an audit row, because `audit_logs` records mutations and
 * this is not one.
 */
export interface PaystackCheck {
  reference: string;
  /** Status in our `payments` table. */
  dbStatus: string;
  /** Status Paystack reports right now. */
  paystackStatus: string;
  /** What we charged, in pesewas. */
  chargedPesewas: number;
  /** What Paystack says the transaction was for, in pesewas. */
  paystackPesewas: number;
  chargedCurrency: string;
  paystackCurrency: string;
  channel: string | null;
  paidAt: string | null;
  /** When this check ran, ISO. Not persisted — it describes this answer only. */
  checkedAt: string;
  /**
   * True when Paystack's answer and our row tell the same story: same status,
   * same amount, same currency. False is the interesting case and the screen
   * spells out which part disagrees.
   */
  agrees: boolean;
}

export async function checkTransactionWithPaystack(paymentId: string): Promise<PaystackCheck> {
  const client = createAdminClient();

  const { data: payment, error } = await client
    .from("payments")
    .select("id, reference, amount, currency, status")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) throw new APIError(500, `Could not load the transaction: ${error.message}`);
  if (!payment) throw new APIError(404, "Transaction not found");

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(payment.reference as string);
  } catch (err) {
    logger.error("Admin Paystack check failed", {
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Deliberately not swallowed: an admin who asked Paystack a question must
    // be told that Paystack did not answer, not shown a stale row as if it had.
    throw new APIError(502, "Paystack did not answer. Nothing was changed. Try again.");
  }

  const data = verification.data;
  const chargedPesewas = Number(payment.amount);
  const dbStatus = payment.status as string;

  // "success" on Paystack's side only agrees with a paid row if the amount and
  // currency match too — the same three-way test `handlePaymentCallback` uses
  // before it will mark anything paid.
  const agrees =
    data.status === (dbStatus === "success" ? "success" : dbStatus) &&
    data.amount === chargedPesewas &&
    data.currency === payment.currency;

  return {
    reference: payment.reference as string,
    dbStatus,
    paystackStatus: data.status,
    chargedPesewas,
    paystackPesewas: data.amount,
    chargedCurrency: payment.currency as string,
    paystackCurrency: data.currency,
    channel: data.channel ?? null,
    paidAt: data.paid_at ?? null,
    checkedAt: new Date().toISOString(),
    agrees,
  };
}

// ── Settling by reference ────────────────────────────────────────────────────

/** One order a payment pays for, as the admin needs to recognise it. */
export interface ReferenceOrder {
  id: string;
  orderNo: string | null;
  productName: string | null;
  status: string;
}

/**
 * What Paystack and we each hold for one reference an admin typed in — the
 * customer says they paid, the bag says it is not paid. Everything here is read
 * on the server; nothing the browser sends but the reference itself is used.
 */
export interface ReferenceLookup {
  reference: string;
  checkedAt: string;
  paystack: {
    status: string;
    pesewas: number;
    currency: string;
    channel: string | null;
    paidAt: string | null;
    gatewayResponse: string | null;
    customerEmail: string | null;
  };
  /** Our `payments` row for this reference, or null when it is not one of ours. */
  payment: {
    id: string;
    status: string;
    pesewas: number;
    currency: string;
    createdAt: string;
    customerEmail: string | null;
    orderGroupId: string | null;
    carOrderId: string | null;
  } | null;
  orders: ReferenceOrder[];
  /** True only when "Mark as paid" would settle something. */
  canSettle: boolean;
  /** Why it cannot, in a sentence for the admin. Null when it can. */
  blockedReason: string | null;
}

const REFERENCE_PATTERN = /^[A-Za-z0-9_.=-]{6,100}$/;

export function normaliseReference(raw: string): string {
  const reference = raw.trim();
  if (!REFERENCE_PATTERN.test(reference)) {
    throw new APIError(400, "That does not look like a Paystack reference. Copy it exactly, e.g. TOM_1792016963655_9337bd0c874c.");
  }
  return reference;
}

export async function lookupPaystackReference(rawReference: string): Promise<ReferenceLookup> {
  const reference = normaliseReference(rawReference);
  const client = createAdminClient();

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(reference);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // `paystackFetch` reports a non-2xx as "Paystack API error: <status>";
    // 400 and 404 are Paystack saying it has no such transaction.
    if (/: (400|404)$/.test(message)) {
      throw new APIError(404, "Paystack has no transaction with that reference. Check it was copied exactly.");
    }
    logger.error("Admin Paystack reference lookup failed", { reference, error: message });
    throw new APIError(502, "Paystack did not answer. Nothing was changed. Try again.");
  }
  const data = verification.data;

  const { data: row, error } = await client
    .from("payments")
    .select("id, user_id, status, amount, currency, created_at, metadata, order_group_id, car_order_id")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new APIError(500, `Could not load the payment: ${error.message}`);

  const payment = row as {
    id: string; user_id: string; status: string; amount: number; currency: string; created_at: string;
    metadata: Record<string, unknown> | null; order_group_id: string | null; car_order_id: string | null;
  } | null;

  let orders: ReferenceOrder[] = [];
  let customerEmail: string | null = null;
  if (payment) {
    const legacyOrderId = typeof payment.metadata?.order_id === "string" ? payment.metadata.order_id : null;
    if (payment.order_group_id || legacyOrderId) {
      const query = client.from("orders").select("id, order_no, product_name, status");
      const { data: orderRows, error: orderError } = payment.order_group_id
        ? await query.eq("order_group_id", payment.order_group_id).order("created_at", { ascending: true })
        : await query.eq("id", legacyOrderId as string);
      if (orderError) throw new APIError(500, `Could not load the orders: ${orderError.message}`);
      orders = ((orderRows ?? []) as { id: string; order_no: string | null; product_name: string | null; status: string }[])
        .map((o) => ({ id: o.id, orderNo: o.order_no, productName: o.product_name, status: o.status }));
    }
    customerEmail = await getRecipientEmail(payment.user_id).catch(() => null);
  }

  const amountMatches = payment != null && data.amount === Number(payment.amount);
  const currencyMatches = payment != null && data.currency === payment.currency;
  const blockedReason = !payment
    ? "This reference is on Paystack but not in Tomame, so there is no order to mark paid."
    : payment.status === "success"
      ? "Already paid. Nothing to do."
      : data.status !== "success"
        ? `Paystack says "${data.status}": no money has arrived on this reference.`
        : !amountMatches
          ? "Paystack's amount differs from what we charged. This needs a decision, not a settle."
          : !currencyMatches
            ? "Paystack's currency differs from what we charged. This needs a decision, not a settle."
            : null;

  const meta = (data as unknown as { gateway_response?: string | null; customer?: { email?: string | null } | null });
  return {
    reference,
    checkedAt: new Date().toISOString(),
    paystack: {
      status: data.status,
      pesewas: data.amount,
      currency: data.currency,
      channel: data.channel ?? null,
      paidAt: data.paid_at ?? null,
      gatewayResponse: meta.gateway_response ?? null,
      customerEmail: meta.customer?.email ?? null,
    },
    payment: payment
      ? {
          id: payment.id,
          status: payment.status,
          pesewas: Number(payment.amount),
          currency: payment.currency,
          createdAt: payment.created_at,
          customerEmail,
          orderGroupId: payment.order_group_id,
          carOrderId: payment.car_order_id,
        }
      : null,
    orders,
    canSettle: blockedReason === null,
    blockedReason,
  };
}

export interface ReferenceSettleResult {
  settled: boolean;
  message: string;
  lookup: ReferenceLookup;
}

/**
 * "Mark as paid", for a reference Paystack confirms. It does not take the
 * admin's word for anything: it asks Paystack again, refuses unless the lookup
 * says the charge can settle, and then settles through `handlePaymentCallback`
 * — the same guarded path, amount check, order fan-out, emails and audit rows
 * the webhook uses. The admin's own audit row records who pressed it.
 */
export async function settlePaystackReference(
  adminUser: { id: string },
  rawReference: string,
): Promise<ReferenceSettleResult> {
  const before = await lookupPaystackReference(rawReference);
  if (!before.canSettle || !before.payment) {
    throw new APIError(409, before.blockedReason ?? "This payment cannot be settled.");
  }

  await handlePaymentCallback(before.reference);
  const after = await lookupPaystackReference(before.reference);
  const settled = after.payment?.status === "success";

  await logAuditEvent({
    actorId: adminUser.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "payment_settled_by_admin",
    entityType: "payment",
    entityId: before.payment.id,
    metadata: {
      reference: before.reference,
      from: before.payment.status,
      to: after.payment?.status ?? null,
      paystackStatus: before.paystack.status,
      paystackPesewas: before.paystack.pesewas,
      orderGroupId: before.payment.orderGroupId,
      orderIds: after.orders.map((o) => o.id),
      settled,
    },
  });

  const unpayable = after.orders.filter((o) => o.status === "cancelled");
  return {
    settled,
    message: !settled
      ? "Paystack's answer changed while settling. Nothing was marked paid; check again."
      : unpayable.length > 0
        ? `Payment recorded, but ${unpayable.length} order(s) were no longer payable (cancelled). They need a refund or a reinstatement.`
        : `Payment recorded. ${after.orders.length} order(s) are now paid and the customer has been emailed.`,
    lookup: after,
  };
}
