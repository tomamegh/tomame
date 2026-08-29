import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: {
    app: { url: "https://tomame.test" },
    paystack: { secretKey: "sk_test", publicKey: "pk_test" },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

vi.mock("@/lib/paystack/client", () => ({
  initializeTransaction: vi.fn(),
  verifyTransaction: vi.fn(),
  generatePaymentReference: vi.fn(),
}));

vi.mock("@/features/orders/services/orders.service", () => ({
  getOrderById: vi.fn(),
  linkOrderToPayment: vi.fn(),
  sendOrderStatusEmail: vi.fn(),
}));

vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));

vi.mock("@/features/notifications/services/notifications.service", () => ({
  createOrderNotifications: vi.fn(),
}));

import {
  initializePayment,
  handlePaymentCallback,
  handleWebhookEvent,
  unresolvedPaymentUrl,
} from "@/features/payments/services/payments.service";
import { initializePaymentSchema } from "@/features/payments/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  initializeTransaction,
  verifyTransaction,
  generatePaymentReference,
} from "@/lib/paystack/client";
import {
  getOrderById,
  linkOrderToPayment,
  sendOrderStatusEmail,
} from "@/features/orders/services/orders.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createOrderNotifications } from "@/features/notifications/services/notifications.service";
import { APIError } from "@/lib/auth/api-helpers";
import { createFakeClient, type FakeDb, type Row } from "./fake-supabase";
import type { PlatformUser } from "@/features/users/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Real v4 UUIDs — the request schema validates the RFC variant, so placeholder
// digits would be rejected before the service is ever reached.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";
const REFERENCE = "TOM_1700000000000_abc123";

let db: FakeDb;

function makeUser(overrides: Partial<PlatformUser> = {}): PlatformUser {
  return {
    id: USER_ID,
    email: "customer@example.com",
    profile: { id: USER_ID, role: "user", created_at: new Date(), updated_at: new Date() },
    ...overrides,
  } as unknown as PlatformUser;
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    user_id: USER_ID,
    status: "pending",
    product_name: "Sony WH-1000XM5",
    admin_total_ghs: null,
    admin_pricing_note: null,
    pricing: { total_ghs: 1250.5 },
    ...overrides,
  };
}

/** Seed a payment row directly, as initialization would have left it. */
function seedPayment(overrides: Partial<Row> = {}): Row {
  const payment: Row = {
    id: PAYMENT_ID,
    user_id: USER_ID,
    reference: REFERENCE,
    amount: 125_050,
    currency: "GHS",
    status: "pending",
    channel: null,
    metadata: { order_id: ORDER_ID },
    created_at: new Date().toISOString(),
    ...overrides,
  };
  db.payments.push(payment);
  return payment;
}

function verification(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    message: "Verification successful",
    data: {
      id: 99,
      status: "success",
      reference: REFERENCE,
      amount: 125_050,
      currency: "GHS",
      channel: "mobile_money",
      paid_at: "2026-08-29T10:00:00Z",
      customer: { email: "customer@example.com" },
      metadata: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db = { payments: [] };
  vi.mocked(createAdminClient).mockReturnValue(
    createFakeClient(db) as unknown as ReturnType<typeof createAdminClient>,
  );
  vi.mocked(generatePaymentReference).mockReturnValue(REFERENCE);
  vi.mocked(getOrderById).mockResolvedValue(makeOrder() as never);
  vi.mocked(linkOrderToPayment).mockImplementation(
    async () => makeOrder({ status: "paid" }) as never,
  );
  vi.mocked(initializeTransaction).mockResolvedValue({
    status: true,
    message: "ok",
    data: {
      authorization_url: "https://checkout.paystack.com/xyz",
      access_code: "xyz",
      reference: REFERENCE,
    },
  });
  vi.mocked(verifyTransaction).mockResolvedValue(verification() as never);
});

async function expectApiError(promise: Promise<unknown>, statusCode: number) {
  await expect(promise).rejects.toBeInstanceOf(APIError);
  await promise.catch((err: APIError) => expect(err.statusCode).toBe(statusCode));
}

/** The single payment row the test just caused to be written. */
function onlyPayment(): Row {
  const payment = db.payments.at(0);
  if (!payment) throw new Error("expected a payment row to have been written");
  return payment;
}

/** Arguments the service passed to Paystack's initialize call. */
function initializeArgs() {
  const call = vi.mocked(initializeTransaction).mock.calls.at(0);
  if (!call) throw new Error("expected initializeTransaction to have been called");
  return call[0];
}

// ── R1: only the owner, only an unpaid order ─────────────────────────────────

describe("initializePayment — authorization (R1)", () => {
  it("refuses an order belonging to another user, indistinguishably from a missing one", async () => {
    vi.mocked(getOrderById).mockResolvedValue(
      makeOrder({ user_id: "99999999-9999-4999-8999-999999999999" }) as never,
    );

    await expectApiError(initializePayment(makeUser(), ORDER_ID), 404);
    expect(db.payments).toHaveLength(0);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("refuses an order that is not awaiting payment", async () => {
    vi.mocked(getOrderById).mockResolvedValue(makeOrder({ status: "paid" }) as never);

    await expectApiError(initializePayment(makeUser(), ORDER_ID), 400);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("refuses an order that does not exist", async () => {
    vi.mocked(getOrderById).mockResolvedValue(null as never);
    await expectApiError(initializePayment(makeUser(), ORDER_ID), 404);
  });
});

// ── R2: never a second live payment for one order ────────────────────────────

describe("initializePayment — double payment guard (R2)", () => {
  it("refuses when the order already has a successful payment", async () => {
    seedPayment({ status: "success" });

    await expectApiError(initializePayment(makeUser(), ORDER_ID), 409);
    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(db.payments).toHaveLength(1);
  });

  it("refuses when a payment for the order is still pending", async () => {
    seedPayment({ status: "pending" });

    await expectApiError(initializePayment(makeUser(), ORDER_ID), 409);
    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(db.payments).toHaveLength(1);
  });

  it("allows a retry after the previous attempt failed", async () => {
    seedPayment({ status: "failed", reference: "TOM_1_old" });

    const result = await initializePayment(makeUser(), ORDER_ID);

    expect(result.authorizationUrl).toBe("https://checkout.paystack.com/xyz");
    expect(db.payments).toHaveLength(2);
  });
});

// ── R3 / R10: what actually gets charged, and to whom ────────────────────────

describe("initializePayment — amount and customer (R3, R10)", () => {
  it("charges the calculated total in whole pesewas", async () => {
    await initializePayment(makeUser(), ORDER_ID);

    expect(initializeArgs().amount).toBe(125_050);
    expect(onlyPayment().amount).toBe(125_050);
    expect(onlyPayment().currency).toBe("GHS");
  });

  it("prefers the admin-set total over the calculated one", async () => {
    vi.mocked(getOrderById).mockResolvedValue(
      makeOrder({ admin_total_ghs: 900, pricing: { total_ghs: 1250.5 } }) as never,
    );

    await initializePayment(makeUser(), ORDER_ID);

    expect(initializeArgs().amount).toBe(90_000);
  });

  it("ignores an amount supplied by the caller (R3)", async () => {
    // The request contract carries an order id and nothing else, so a client
    // cannot name its own price. Asserted here because it is the contract, not
    // an accident of the current handler.
    const parsed = initializePaymentSchema.safeParse({ orderId: ORDER_ID, amount: 1 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ orderId: ORDER_ID });

    await initializePayment(makeUser(), ORDER_ID);
    expect(initializeArgs().amount).toBe(125_050);
  });

  it("refuses when the order has no determined price", async () => {
    vi.mocked(getOrderById).mockResolvedValue(
      makeOrder({ pricing: { total_ghs: 0 } }) as never,
    );

    await expectApiError(initializePayment(makeUser(), ORDER_ID), 400);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("refuses a user with no email rather than calling Paystack (R10)", async () => {
    await expectApiError(initializePayment(makeUser({ email: undefined }), ORDER_ID), 400);

    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(db.payments).toHaveLength(0);
  });

  it("records the payment as failed when Paystack cannot be reached", async () => {
    vi.mocked(initializeTransaction).mockRejectedValue(new Error("network down"));

    await expectApiError(initializePayment(makeUser(), ORDER_ID), 502);

    // Left failed, not pending — otherwise R2 would block the customer's retry.
    expect(onlyPayment().status).toBe("failed");
    expect((onlyPayment().metadata as Record<string, unknown>).order_id).toBe(ORDER_ID);
  });

  it("writes an audit event for the initialization (R12)", async () => {
    await initializePayment(makeUser(), ORDER_ID);

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_initialized", entityType: "payment" }),
    );
  });
});

// ── R4 / R11: the verified charge must be the charge we asked for ────────────

describe("handlePaymentCallback — verification mismatch (R4, R11)", () => {
  it("refuses to mark paid when Paystack reports a smaller amount", async () => {
    const payment = seedPayment();
    vi.mocked(verifyTransaction).mockResolvedValue(verification({ amount: 100 }) as never);

    const { redirectUrl } = await handlePaymentCallback(REFERENCE);

    expect(payment.status).toBe("failed");
    expect(linkOrderToPayment).not.toHaveBeenCalled();
    expect(createOrderNotifications).not.toHaveBeenCalled();
    expect(sendOrderStatusEmail).not.toHaveBeenCalled();
    expect(redirectUrl).toBe(`https://tomame.test/app/orders/${ORDER_ID}/checkout?payment=failed`);
  });

  it("refuses to mark paid when Paystack reports a different currency", async () => {
    const payment = seedPayment();
    vi.mocked(verifyTransaction).mockResolvedValue(
      verification({ currency: "NGN" }) as never,
    );

    await handlePaymentCallback(REFERENCE);

    expect(payment.status).toBe("failed");
    expect(linkOrderToPayment).not.toHaveBeenCalled();
  });

  it("records the failure and leaves the order unpaid when the charge was declined", async () => {
    const payment = seedPayment();
    vi.mocked(verifyTransaction).mockResolvedValue(
      verification({ status: "failed" }) as never,
    );

    await handlePaymentCallback(REFERENCE);

    expect(payment.status).toBe("failed");
    expect((payment.metadata as Record<string, unknown>).paystack_verification).toBeDefined();
    expect(linkOrderToPayment).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_failed" }),
    );
  });

  it("keeps the order link in metadata after recording a failure", async () => {
    const payment = seedPayment();
    vi.mocked(verifyTransaction).mockResolvedValue(
      verification({ status: "failed" }) as never,
    );

    await handlePaymentCallback(REFERENCE);

    expect((payment.metadata as Record<string, unknown>).order_id).toBe(ORDER_ID);
  });

  it("leaves the payment pending when verification itself fails, so a retry can finish it", async () => {
    const payment = seedPayment();
    vi.mocked(verifyTransaction).mockRejectedValue(new Error("paystack 503"));

    await expectApiError(handlePaymentCallback(REFERENCE), 502);

    expect(payment.status).toBe("pending");
  });

  it("does not report a charge as settled when the database write fails", async () => {
    // A failed write must not be mistaken for "the other delivery already
    // handled it" — that would show the customer a success page while the
    // order stayed unpaid and nothing was ever sent.
    seedPayment();
    db.failWrites = true;

    await expectApiError(handlePaymentCallback(REFERENCE), 502);

    expect(linkOrderToPayment).not.toHaveBeenCalled();
    expect(sendOrderStatusEmail).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_successful" }),
    );
  });
});

// ── R6: the happy path ───────────────────────────────────────────────────────

describe("handlePaymentCallback — successful charge (R6)", () => {
  it("marks the payment successful, promotes the order, and notifies the customer once", async () => {
    const payment = seedPayment();

    const { redirectUrl } = await handlePaymentCallback(REFERENCE);

    expect(payment.status).toBe("success");
    expect(payment.channel).toBe("mobile_money");
    expect((payment.metadata as Record<string, unknown>).order_id).toBe(ORDER_ID);

    expect(linkOrderToPayment).toHaveBeenCalledTimes(1);
    expect(linkOrderToPayment).toHaveBeenCalledWith(expect.anything(), ORDER_ID, payment.id);
    expect(createOrderNotifications).toHaveBeenCalledTimes(1);
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1);

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_successful" }),
    );
    expect(redirectUrl).toBe(`https://tomame.test/app/orders/${ORDER_ID}?payment=success`);
  });
});

// ── R5: at most once, however many deliveries arrive ─────────────────────────

describe("post-payment effects run at most once (R5)", () => {
  it("does not repeat the effects when the callback is replayed", async () => {
    seedPayment();

    await handlePaymentCallback(REFERENCE);
    await handlePaymentCallback(REFERENCE);
    await handlePaymentCallback(REFERENCE);

    expect(linkOrderToPayment).toHaveBeenCalledTimes(1);
    expect(createOrderNotifications).toHaveBeenCalledTimes(1);
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1);
  });

  /**
   * Hold every delivery inside verification until `expected` of them have got
   * there, then release them together. Without this the two deliveries tend to
   * serialize by luck and the second one short-circuits on an already-final
   * payment, so the test would pass with no guard in place at all.
   */
  function holdInVerification(expected: number, result = verification()) {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = 0;

    vi.mocked(verifyTransaction).mockImplementation(async () => {
      arrived += 1;
      if (arrived === expected) release();
      await barrier;
      return result as never;
    });
  }

  it("sends one email when two deliveries both verify a pending payment", async () => {
    seedPayment();
    holdInVerification(2);

    await Promise.all([handlePaymentCallback(REFERENCE), handlePaymentCallback(REFERENCE)]);

    expect(verifyTransaction).toHaveBeenCalledTimes(2);
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1);
    expect(createOrderNotifications).toHaveBeenCalledTimes(1);
    expect(linkOrderToPayment).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(logAuditEvent).mock.calls.filter(
        ([e]) => e.action === "payment_successful",
      ),
    ).toHaveLength(1);
  });

  it("sends one email when the browser callback and the webhook arrive concurrently", async () => {
    seedPayment();
    holdInVerification(2);

    await Promise.all([
      handlePaymentCallback(REFERENCE),
      handleWebhookEvent({
        event: "charge.success",
        data: { reference: REFERENCE, status: "success", amount: 125_050, currency: "GHS" },
      }),
    ]);

    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1);
    expect(createOrderNotifications).toHaveBeenCalledTimes(1);
    expect(linkOrderToPayment).toHaveBeenCalledTimes(1);
  });

  it("does not audit a failure twice when two deliveries report a declined charge", async () => {
    seedPayment();
    holdInVerification(2, verification({ status: "failed" }));

    await Promise.all([handlePaymentCallback(REFERENCE), handlePaymentCallback(REFERENCE)]);

    expect(
      vi.mocked(logAuditEvent).mock.calls.filter(([e]) => e.action === "payment_failed"),
    ).toHaveLength(1);
  });
});

// ── R7: the customer always lands somewhere real ─────────────────────────────

describe("handlePaymentCallback — redirects (R7)", () => {
  it("never redirects to a bare /orders path, which does not exist in this app", async () => {
    const cases: Array<() => Promise<{ redirectUrl: string }>> = [
      async () => {
        seedPayment();
        return handlePaymentCallback(REFERENCE);
      },
      async () => {
        seedPayment({ status: "success" });
        return handlePaymentCallback(REFERENCE);
      },
      async () => {
        seedPayment({ status: "failed" });
        return handlePaymentCallback(REFERENCE);
      },
      async () => {
        seedPayment();
        vi.mocked(verifyTransaction).mockResolvedValue(
          verification({ status: "failed" }) as never,
        );
        return handlePaymentCallback(REFERENCE);
      },
      async () => {
        seedPayment({ metadata: {} });
        return handlePaymentCallback(REFERENCE);
      },
    ];

    for (const run of cases) {
      db = { payments: [] };
      vi.mocked(createAdminClient).mockReturnValue(
        createFakeClient(db) as unknown as ReturnType<typeof createAdminClient>,
      );
      vi.mocked(verifyTransaction).mockResolvedValue(verification() as never);

      const { redirectUrl } = await run();
      expect(new URL(redirectUrl).pathname).toMatch(/^\/app\/orders/);
    }
  });

  it("sends an unresolvable return to a real page too", async () => {
    // Used by the callback route when the reference cannot be parsed or the
    // lookup throws — the paths that previously produced the 404.
    expect(unresolvedPaymentUrl()).toBe("https://tomame.test/app/orders?payment=error");
    expect(new URL(unresolvedPaymentUrl()).pathname).toBe("/app/orders");
  });

  it("falls back to the orders list when the payment carries no order", async () => {
    seedPayment({ metadata: {} });

    const { redirectUrl } = await handlePaymentCallback(REFERENCE);

    expect(redirectUrl).toBe("https://tomame.test/app/orders?payment=success");
  });

  it("reports the outcome of an already-finalized payment without re-verifying", async () => {
    seedPayment({ status: "success" });

    const { redirectUrl } = await handlePaymentCallback(REFERENCE);

    expect(verifyTransaction).not.toHaveBeenCalled();
    expect(redirectUrl).toBe(`https://tomame.test/app/orders/${ORDER_ID}?payment=success`);
  });
});

// ── R9: what Paystack should and should not retry ────────────────────────────

describe("handleWebhookEvent — retry contract (R9)", () => {
  it("accepts and ignores an event type it does not handle", async () => {
    const result = await handleWebhookEvent({
      event: "transfer.success",
      data: { reference: REFERENCE, status: "success", amount: 1, currency: "GHS" },
    });

    expect(result.message).toBe("Event ignored");
    expect(verifyTransaction).not.toHaveBeenCalled();
  });

  it("accepts and ignores a reference it does not recognize", async () => {
    const result = await handleWebhookEvent({
      event: "charge.success",
      data: { reference: "TOM_1_unknown", status: "success", amount: 1, currency: "GHS" },
    });

    expect(result.message).toBe("Payment not found, ignored");
    expect(linkOrderToPayment).not.toHaveBeenCalled();
  });

  it("accepts a charge it has already finalized, without repeating the effects", async () => {
    seedPayment({ status: "success" });

    const result = await handleWebhookEvent({
      event: "charge.success",
      data: { reference: REFERENCE, status: "success", amount: 125_050, currency: "GHS" },
    });

    expect(result.message).toBe("Already processed");
    expect(sendOrderStatusEmail).not.toHaveBeenCalled();
  });

  it("throws on a transient verification failure so Paystack retries the delivery", async () => {
    seedPayment();
    vi.mocked(verifyTransaction).mockRejectedValue(new Error("paystack 503"));

    await expect(
      handleWebhookEvent({
        event: "charge.success",
        data: { reference: REFERENCE, status: "success", amount: 125_050, currency: "GHS" },
      }),
    ).rejects.toThrow();
  });

  it("promotes the order when the callback never arrived", async () => {
    const payment = seedPayment();

    await handleWebhookEvent({
      event: "charge.success",
      data: { reference: REFERENCE, status: "success", amount: 125_050, currency: "GHS" },
    });

    expect(payment.status).toBe("success");
    expect(linkOrderToPayment).toHaveBeenCalledTimes(1);
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1);
  });
});
