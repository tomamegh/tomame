import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import { PAYMENT_STATUSES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { getPaymentChannel } from "@/features/payments/services/payment-channels.service";
import {
  auditPaymentStarted,
  failOpenedPayment,
  findActivePayment,
  getPaymentByReference,
  handlePaymentCallback,
  openPendingPayment,
  paymentReturnUrl,
} from "@/features/payments/services/payments.service";
import { normaliseGhanaPhone, maskPhone } from "@/features/order-delivery/schema";
import { selectSavedMomo, updateSavedMomo } from "@/db/queries/profiles";
import { chargeMobileMoney, submitChargeOtp, verifyTransaction, type ChargeResult } from "@/lib/paystack/client";
import type { PlatformUser } from "@/features/users/types";
import type { Payment } from "@/features/payments/types";
import type { StartMomoPaymentInput } from "@/features/payments/schema";
import { inferMomoProvider, toLocalGhanaPhone, type MomoPaymentState, type MomoPrefill } from "../momo";

/**
 * Pay by Mobile Money without leaving the site (Seamless Roadmap, Initiative 1).
 *
 * Instead of the hosted checkout, where the customer re-types their number, Pay
 * sends the prompt straight to the phone through Paystack's charge API. The
 * money rules do not move: `openPendingPayment` is the same step the hosted
 * checkout takes (amount from the order group, the double-charge guard, the
 * review gate), and SETTLING is still `handlePaymentCallback` — a server-side
 * verify, amount and currency compared — reached either from the browser's
 * status check here or from the `charge.success` webhook, whichever lands first.
 */

const APPROVE_TEXT = "We sent a payment prompt to your phone. Enter your Mobile Money PIN to approve it.";
const OTP_TEXT = "Your network sent you a code by text. Enter it to continue.";
const DECLINED_TEXT = "The payment was not approved. Nothing was charged.";

/** Paystack's terminal outcomes; anything else means the prompt is still open. */
const SETTLED_STATUSES = new Set(["success", "failed", "abandoned", "reversed"]);

/** The number the pay rail starts from: the remembered one, else the account phone. */
export async function getMomoPrefill(userId: string, profilePhone: string | null): Promise<MomoPrefill> {
  try {
    const saved = await selectSavedMomo(createAdminClient(), userId);
    if (saved?.momo_phone && saved.momo_provider) {
      return { phone: saved.momo_phone, provider: saved.momo_provider, saved: true };
    }
  } catch (error) {
    // A prefill is a convenience: without it the customer types the number.
    logger.warn("MoMo prefill read failed", { userId, error: error instanceof Error ? error.message : String(error) });
  }
  const phone = profilePhone ? normaliseGhanaPhone(profilePhone) : null;
  return { phone, provider: inferMomoProvider(phone), saved: false };
}

/** Start a MoMo payment for a bag (order group) or a single order: the prompt goes to the phone. */
export async function startMomoPayment(user: PlatformUser, input: StartMomoPaymentInput): Promise<MomoPaymentState> {
  if (!user.email) {
    throw new APIError(400, "Your account has no email address. Please contact support.");
  }
  const channel = await getPaymentChannel(input.channel);
  if (!channel || channel.paystack_channel !== "mobile_money" || !channel.provider) {
    throw new APIError(400, "Choose your Mobile Money network");
  }
  const phone = normaliseGhanaPhone(input.phone);
  if (!phone) throw new APIError(400, "Enter a Ghana Mobile Money number, like 024 412 3456");

  const admin = createAdminClient();
  const resumed = await resumeOpenPayment(admin, user, input);
  if (resumed) return resumed;

  const { charge, payment, reference } = await openPendingPayment(admin, user, {
    ...(input.orderGroupId ? { orderGroupId: input.orderGroupId } : { orderId: input.orderId }),
    channel: input.channel,
  });

  let result: ChargeResult;
  try {
    result = await chargeMobileMoney({
      email: user.email,
      amount: charge.amountPesewas,
      reference,
      phone: toLocalGhanaPhone(phone),
      provider: channel.provider,
      ...(charge.paystackMetadata && { metadata: charge.paystackMetadata }),
    });
  } catch (error) {
    await failOpenedPayment(admin, payment, { ...charge.metadata, error: "Paystack charge failed" });
    logger.error("Paystack MoMo charge failed", {
      reference,
      ...charge.target,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new APIError(502, "We could not reach Mobile Money just now. Please try again, or pay by card.");
  }

  await auditPaymentStarted(user, payment, charge, "mobile_money");
  if (result.status !== "failed") {
    await rememberNumber(user.id, input.remember ? { phone, provider: channel.provider } : null);
  }
  return stateFromCharge(payment, result);
}

/** Where a MoMo payment stands now. Settles it (server-side verify) when Paystack has an outcome. */
export async function getMomoPaymentState(user: PlatformUser, reference: string): Promise<MomoPaymentState> {
  const payment = await ownPayment(user, reference);
  if (payment.status === PAYMENT_STATUSES.SUCCESS) return paid(payment);

  let paystackStatus: string;
  try {
    paystackStatus = (await verifyTransaction(reference)).data.status;
  } catch (error) {
    // Transient: the browser asks again in a few seconds, and the webhook may settle it first.
    logger.warn("MoMo status verify failed", { reference, error: error instanceof Error ? error.message : String(error) });
    return approve(payment, null);
  }

  if (SETTLED_STATUSES.has(paystackStatus)) return settle(payment);
  if (payment.status === PAYMENT_STATUSES.FAILED) return failed(payment, null);
  return paystackStatus === "send_otp" ? { state: "otp", reference, message: OTP_TEXT } : approve(payment, null);
}

/** Answer the network's code for a prompt that asked for one. */
export async function submitMomoOtp(user: PlatformUser, reference: string, otp: string): Promise<MomoPaymentState> {
  const payment = await ownPayment(user, reference);
  if (payment.status === PAYMENT_STATUSES.SUCCESS) return paid(payment);
  if (payment.status !== PAYMENT_STATUSES.PENDING) throw new APIError(409, "This payment is no longer waiting for a code. Start again from Pay.");

  let result: ChargeResult;
  try {
    result = await submitChargeOtp(reference, otp);
  } catch (error) {
    logger.error("Paystack submit_otp failed", { reference, error: error instanceof Error ? error.message : String(error) });
    throw new APIError(502, "We could not check that code just now. Please try again.");
  }
  return stateFromCharge(payment, result);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * A pending payment already on this bag (a reload mid-prompt, or a hosted
 * checkout opened and left) would make `openPendingPayment` refuse with "a
 * payment is already in progress". Ask Paystack about it first, on Paystack's
 * word only, never our clock:
 *
 * - settled (success / failed / abandoned / reversed) → settle it the normal
 *   way; a success is reported as paid, anything else frees the bag for a new
 *   prompt (null);
 * - still open → resume THAT prompt rather than send a second one, so a
 *   customer can never approve two charges for one bag.
 */
async function resumeOpenPayment(
  admin: ReturnType<typeof createAdminClient>,
  user: PlatformUser,
  input: StartMomoPaymentInput,
): Promise<MomoPaymentState | null> {
  const open = await findActivePayment(admin, input.orderGroupId ? { groupId: input.orderGroupId } : { orderId: input.orderId! });
  if (!open || open.user_id !== user.id) return null;
  if (open.status === PAYMENT_STATUSES.SUCCESS) return paid(open);

  let paystackStatus: string;
  try {
    paystackStatus = (await verifyTransaction(open.reference)).data.status;
  } catch {
    // Unknown: let the usual guard answer (409) rather than risk a second charge.
    return null;
  }
  if (!SETTLED_STATUSES.has(paystackStatus)) {
    return paystackStatus === "send_otp" ? { state: "otp", reference: open.reference, message: OTP_TEXT } : approve(open, null);
  }
  const settled = await settle(open);
  return settled.state === "paid" ? settled : null;
}

async function ownPayment(user: PlatformUser, reference: string): Promise<Payment> {
  const payment = await getPaymentByReference(createAdminClient(), reference);
  // Someone else's reference reads exactly like an unknown one.
  if (!payment || payment.user_id !== user.id) throw new APIError(404, "Payment not found");
  return payment;
}

async function stateFromCharge(payment: Payment, result: ChargeResult): Promise<MomoPaymentState> {
  switch (result.status) {
    case "success":
    case "failed":
      // Never trusted from the charge response alone: settling verifies again.
      return settle(payment, result.message);
    case "send_otp":
      return { state: "otp", reference: payment.reference, message: result.displayText ?? OTP_TEXT };
    default:
      // pay_offline / pending / ongoing / processing: the prompt is on the phone.
      return approve(payment, result.displayText);
  }
}

/**
 * Hand an outcome to `handlePaymentCallback`, the one settling path (verify,
 * amount and currency check, fan-out, audit), then report what it decided.
 */
async function settle(payment: Payment, declineMessage: string | null = null): Promise<MomoPaymentState> {
  try {
    await handlePaymentCallback(payment.reference);
  } catch (error) {
    logger.warn("MoMo settle deferred", { reference: payment.reference, error: error instanceof Error ? error.message : String(error) });
    return approve(payment, null);
  }
  const after = await getPaymentByReference(createAdminClient(), payment.reference);
  if (after?.status === PAYMENT_STATUSES.SUCCESS) return paid(after);
  if (after?.status === PAYMENT_STATUSES.FAILED) return failed(after, declineMessage);
  return approve(payment, null);
}

function paid(payment: Payment): MomoPaymentState {
  return { state: "paid", reference: payment.reference, redirectUrl: paymentReturnUrl(payment, "success") };
}

function failed(payment: Payment, message: string | null): MomoPaymentState {
  return { state: "failed", reference: payment.reference, message: customerDecline(message) };
}

function approve(payment: Payment, displayText: string | null): MomoPaymentState {
  return { state: "approve", reference: payment.reference, message: displayText ?? APPROVE_TEXT };
}

/**
 * Paystack's decline text is written for merchants ("Declined. Please use the
 * test mobile money number…"). The customer is told the outcome plainly, with
 * the network's own reason kept only when it is short and about their wallet.
 */
function customerDecline(message: string | null): string {
  if (message && /insufficient|balance|limit/i.test(message)) {
    return "Mobile Money declined the payment: not enough balance or over the wallet limit. Nothing was charged.";
  }
  return DECLINED_TEXT;
}

/** Save the number (with consent) or forget it (box unticked). Never blocks the payment. */
async function rememberNumber(userId: string, value: { phone: string; provider: "mtn" | "vod" | "atl" } | null): Promise<void> {
  const admin = createAdminClient();
  try {
    const current = await selectSavedMomo(admin, userId);
    const same = value
      ? current?.momo_phone === value.phone && current?.momo_provider === value.provider
      : !current?.momo_phone;
    if (same) return;
    await updateSavedMomo(admin, userId, value);
    await logAuditEvent({
      actorId: userId,
      actorRole: "user",
      action: value ? "momo_number_saved" : "momo_number_forgotten",
      entityType: "user",
      entityId: userId,
      metadata: value ? { phone: maskPhone(value.phone), provider: value.provider } : undefined,
    });
  } catch (error) {
    logger.warn("Saving the MoMo number failed", { userId, error: error instanceof Error ? error.message : String(error) });
  }
}
