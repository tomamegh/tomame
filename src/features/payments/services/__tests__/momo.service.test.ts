import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/payments/services/payment-channels.service", () => ({ getPaymentChannel: vi.fn() }));
vi.mock("@/db/queries/profiles", () => ({ selectSavedMomo: vi.fn(), updateSavedMomo: vi.fn() }));
vi.mock("@/lib/paystack/client", () => ({
  chargeMobileMoney: vi.fn(),
  submitChargeOtp: vi.fn(),
  verifyTransaction: vi.fn(),
}));
vi.mock("@/features/payments/services/payments.service", () => ({
  auditPaymentStarted: vi.fn(),
  failOpenedPayment: vi.fn(),
  findActivePayment: vi.fn(),
  getPaymentByReference: vi.fn(),
  handlePaymentCallback: vi.fn(),
  openPendingPayment: vi.fn(),
  paymentReturnUrl: vi.fn(() => "https://tomame.test/app/orders?payment=success&group=g1"),
}));

import { getPaymentChannel } from "@/features/payments/services/payment-channels.service";
import { selectSavedMomo, updateSavedMomo } from "@/db/queries/profiles";
import { chargeMobileMoney, verifyTransaction } from "@/lib/paystack/client";
import {
  failOpenedPayment,
  findActivePayment,
  getPaymentByReference,
  handlePaymentCallback,
  openPendingPayment,
} from "@/features/payments/services/payments.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { getMomoPaymentState, getMomoPrefill, startMomoPayment } from "../momo.service";
import type { PlatformUser } from "@/features/users/types";
import type { Payment } from "@/features/payments/types";

const GROUP = "11111111-1111-4111-8111-111111111111";
const user = { id: "u1", email: "ama@example.com", profile: { phone: "0551234987" } } as unknown as PlatformUser;
const MTN = { id: "mtn_momo", label: "MTN MoMo", paystack_channel: "mobile_money", provider: "mtn", dot: null };
const CARD = { id: "card", label: "Card", paystack_channel: "card", provider: null, dot: null };

function payment(status: string, overrides: Partial<Payment> = {}): Payment {
  return { id: "p1", reference: "TOM_1_ab", user_id: "u1", status, amount: 80299, currency: "GHS", order_group_id: GROUP, metadata: {}, ...overrides } as Payment;
}

const charge = { target: { groupId: GROUP, orderId: null, carOrderId: null }, amountPesewas: 80299, channels: ["mobile_money"], metadata: {}, paystackMetadata: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPaymentChannel).mockResolvedValue(MTN as never);
  vi.mocked(findActivePayment).mockResolvedValue(null);
  vi.mocked(openPendingPayment).mockResolvedValue({ charge, payment: payment("pending"), reference: "TOM_1_ab" } as never);
  vi.mocked(selectSavedMomo).mockResolvedValue({ momo_phone: null, momo_provider: null, momo_saved_at: null });
});

describe("startMomoPayment", () => {
  const input = { orderGroupId: GROUP, channel: "mtn_momo", phone: "055 123 4987", remember: true };

  it("sends the prompt to the local form of the number on the chosen network", async () => {
    vi.mocked(chargeMobileMoney).mockResolvedValue({ status: "pay_offline", reference: "TOM_1_ab", displayText: null, message: null });

    const state = await startMomoPayment(user, input);

    expect(chargeMobileMoney).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ama@example.com", amount: 80299, phone: "0551234987", provider: "mtn", reference: "TOM_1_ab" }),
    );
    expect(state).toEqual({ state: "approve", reference: "TOM_1_ab", message: expect.stringContaining("PIN") });
  });

  it("remembers the number only with the tick, and audits it", async () => {
    vi.mocked(chargeMobileMoney).mockResolvedValue({ status: "pay_offline", reference: "TOM_1_ab", displayText: null, message: null });
    await startMomoPayment(user, input);
    expect(updateSavedMomo).toHaveBeenCalledWith({}, "u1", { phone: "+233551234987", provider: "mtn" });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "momo_number_saved" }));
  });

  it("forgets a saved number when the tick is off", async () => {
    vi.mocked(selectSavedMomo).mockResolvedValue({ momo_phone: "+233551234987", momo_provider: "mtn", momo_saved_at: "2026-11-22T00:00:00Z" });
    vi.mocked(chargeMobileMoney).mockResolvedValue({ status: "pay_offline", reference: "TOM_1_ab", displayText: null, message: null });
    await startMomoPayment(user, { ...input, remember: false });
    expect(updateSavedMomo).toHaveBeenCalledWith({}, "u1", null);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "momo_number_forgotten" }));
  });

  it("refuses a card channel and a number that is not Ghanaian, before any payment row", async () => {
    vi.mocked(getPaymentChannel).mockResolvedValueOnce(CARD as never);
    await expect(startMomoPayment(user, input)).rejects.toThrow("Choose your Mobile Money network");
    await expect(startMomoPayment(user, { ...input, phone: "+1 415 555 0100" })).rejects.toThrow("Ghana Mobile Money number");
    expect(openPendingPayment).not.toHaveBeenCalled();
  });

  it("settles a decline through the one settling path and does not save the number", async () => {
    vi.mocked(chargeMobileMoney).mockResolvedValue({ status: "failed", reference: "TOM_1_ab", displayText: null, message: "Declined. Please use the test number" });
    vi.mocked(getPaymentByReference).mockResolvedValue(payment("failed"));

    const state = await startMomoPayment(user, input);

    expect(handlePaymentCallback).toHaveBeenCalledWith("TOM_1_ab");
    expect(state).toEqual({ state: "failed", reference: "TOM_1_ab", message: "The payment was not approved. Nothing was charged." });
    expect(updateSavedMomo).not.toHaveBeenCalled();
  });

  it("never trusts an immediate success without the settling verify", async () => {
    vi.mocked(chargeMobileMoney).mockResolvedValue({ status: "success", reference: "TOM_1_ab", displayText: null, message: null });
    vi.mocked(getPaymentByReference).mockResolvedValue(payment("success"));

    const state = await startMomoPayment(user, input);

    expect(handlePaymentCallback).toHaveBeenCalledWith("TOM_1_ab");
    expect(state.state).toBe("paid");
  });

  it("marks the row failed and answers 502 when Paystack cannot be reached", async () => {
    vi.mocked(chargeMobileMoney).mockRejectedValue(new Error("Paystack API error: 503"));
    await expect(startMomoPayment(user, input)).rejects.toThrow("could not reach Mobile Money");
    expect(failOpenedPayment).toHaveBeenCalled();
  });

  it("resumes a prompt still open on this bag instead of sending a second one", async () => {
    vi.mocked(findActivePayment).mockResolvedValue(payment("pending", { reference: "TOM_9_old" }));
    vi.mocked(verifyTransaction).mockResolvedValue({ data: { status: "ongoing" } } as never);

    const state = await startMomoPayment(user, input);

    expect(state).toEqual(expect.objectContaining({ state: "approve", reference: "TOM_9_old" }));
    expect(openPendingPayment).not.toHaveBeenCalled();
    expect(chargeMobileMoney).not.toHaveBeenCalled();
  });

  it("clears an abandoned earlier payment, then sends a fresh prompt", async () => {
    vi.mocked(findActivePayment).mockResolvedValue(payment("pending", { reference: "TOM_9_old" }));
    vi.mocked(verifyTransaction).mockResolvedValue({ data: { status: "abandoned" } } as never);
    vi.mocked(getPaymentByReference).mockResolvedValue(payment("failed", { reference: "TOM_9_old" }));
    vi.mocked(chargeMobileMoney).mockResolvedValue({ status: "pay_offline", reference: "TOM_1_ab", displayText: null, message: null });

    const state = await startMomoPayment(user, input);

    expect(handlePaymentCallback).toHaveBeenCalledWith("TOM_9_old");
    expect(chargeMobileMoney).toHaveBeenCalled();
    expect(state).toEqual(expect.objectContaining({ state: "approve", reference: "TOM_1_ab" }));
  });
});

describe("getMomoPaymentState", () => {
  it("answers 404 for someone else's reference", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue(payment("pending", { user_id: "someone-else" }));
    await expect(getMomoPaymentState(user, "TOM_1_ab")).rejects.toThrow("Payment not found");
  });

  it("keeps waiting while Paystack says the prompt is open", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValue(payment("pending"));
    vi.mocked(verifyTransaction).mockResolvedValue({ data: { status: "ongoing" } } as never);
    expect((await getMomoPaymentState(user, "TOM_1_ab")).state).toBe("approve");
    expect(handlePaymentCallback).not.toHaveBeenCalled();
  });

  it("settles once Paystack reports success and sends the customer to the paid page", async () => {
    vi.mocked(getPaymentByReference).mockResolvedValueOnce(payment("pending")).mockResolvedValueOnce(payment("success"));
    vi.mocked(verifyTransaction).mockResolvedValue({ data: { status: "success" } } as never);
    expect(await getMomoPaymentState(user, "TOM_1_ab")).toEqual({
      state: "paid",
      reference: "TOM_1_ab",
      redirectUrl: "https://tomame.test/app/orders?payment=success&group=g1",
    });
    expect(handlePaymentCallback).toHaveBeenCalledWith("TOM_1_ab");
  });
});

describe("getMomoPrefill", () => {
  it("prefers the remembered number", async () => {
    vi.mocked(selectSavedMomo).mockResolvedValue({ momo_phone: "+233201234567", momo_provider: "vod", momo_saved_at: "2026-11-22T00:00:00Z" });
    expect(await getMomoPrefill("u1", "0551234987")).toEqual({ phone: "+233201234567", provider: "vod", saved: true });
  });

  it("falls back to the account phone with its likely network", async () => {
    expect(await getMomoPrefill("u1", "055 123 4987")).toEqual({ phone: "+233551234987", provider: "mtn", saved: false });
  });
});
