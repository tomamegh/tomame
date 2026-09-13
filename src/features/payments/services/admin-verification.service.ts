import "server-only";

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
    throw new APIError(502, "Paystack did not answer. Nothing was changed — try again.");
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
