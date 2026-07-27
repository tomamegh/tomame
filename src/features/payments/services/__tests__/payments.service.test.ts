import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: {
    hubtel: {
      apiId: "id",
      apiKey: "key",
      merchantAccountNumber: "2019940",
      callbackSecret: "s".repeat(64),
      rmpBaseUrl: "https://rmp.hubtel.test",
      statusBaseUrl: "https://status.hubtel.test",
    },
    app: { url: "https://tomame.test" },
  },
}));

vi.mock("@/lib/hubtel/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hubtel/client")>();
  return {
    ...actual,
    receiveMobileMoney: vi.fn(),
    getTransactionStatus: vi.fn(),
  };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

vi.mock("@/features/orders/services/orders.service", () => ({
  getOrderById: vi.fn(),
  linkOrderToPayment: vi.fn(),
  sendOrderStatusEmail: vi.fn(),
}));

vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@/features/notifications/services/notifications.service", () => ({
  createOrderNotifications: vi.fn(),
}));

import {
  verifyAndSettlePayment,
  handleHubtelCallback,
} from "@/features/payments/services/payments.service";
import { getTransactionStatus } from "@/lib/hubtel/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  linkOrderToPayment,
  sendOrderStatusEmail,
} from "@/features/orders/services/orders.service";
import { createOrderNotifications } from "@/features/notifications/services/notifications.service";
import { logger } from "@/lib/logger";
import type { Payment } from "@/features/payments/types";

// ── Fake Supabase ─────────────────────────────────────────────────────────────

const ORDER_ID = "11111111-1111-1111-1111-111111111111";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    user_id: "user-1",
    reference: "TOM_1_abcdef",
    amount: 25075,
    currency: "GHS",
    status: "pending",
    channel: "mtn-gh",
    customer_msisdn: "0244000000",
    provider_transaction_id: null,
    metadata: { order_id: ORDER_ID },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Fake payments table that honours the `.eq("status", "pending")` predicate,
 * so the compare-and-swap in claimPaymentTransition behaves as it does in
 * Postgres: the second concurrent writer matches zero rows.
 *
 * `onBeforeUpdate` lets a test interleave a competing settler mid-flight by
 * returning the row as that competitor would have left it.
 */
function stubSupabase(
  row: Payment | null,
  onBeforeUpdate?: (current: Payment | null) => Payment | null,
) {
  const updates: Record<string, unknown>[] = [];
  let current = row;

  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            current ? { data: current, error: null } : { data: null, error: {} },
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        if (onBeforeUpdate) current = onBeforeUpdate(current);
        const predicates: Record<string, unknown> = {};

        const applyIfMatched = () => {
          const expected = predicates.status;
          if (expected !== undefined && current?.status !== expected) {
            return null; // CAS lost — zero rows matched.
          }
          updates.push(patch);
          current = current ? ({ ...current, ...patch } as Payment) : current;
          return current;
        };

        const chain = {
          eq: (column: string, value: unknown) => {
            predicates[column] = value;
            return chain;
          },
          select: () => ({
            single: async () => ({ data: applyIfMatched(), error: null }),
            maybeSingle: async () => ({ data: applyIfMatched(), error: null }),
          }),
        };
        return chain;
      },
    }),
  };

  vi.mocked(createAdminClient).mockReturnValue(
    client as unknown as ReturnType<typeof createAdminClient>,
  );
  return updates;
}

/** The first patch written to the payments table, asserted to exist. */
function firstUpdate(updates: Record<string, unknown>[]): Record<string, unknown> {
  const update = updates[0];
  if (!update) throw new Error("no payment update was written");
  return update;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(linkOrderToPayment).mockResolvedValue({
    id: ORDER_ID,
    product_name: "Nike Air",
    admin_total_ghs: 250.75,
    pricing: { total_ghs: 250.75 },
  } as never);
});

// ── verifyAndSettlePayment ────────────────────────────────────────────────────

describe("verifyAndSettlePayment", () => {
  it("marks a payment successful only after Hubtel reports Paid", async () => {
    const updates = stubSupabase(makePayment());
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "success",
      responseCode: "0000",
      message: "",
      transactionId: "tx-1",
      externalTransactionId: null,
      amount: 250.75,
      raw: { data: { status: "Paid" } },
    });

    const result = await verifyAndSettlePayment("TOM_1_abcdef");

    expect(result.status).toBe("success");
    expect(firstUpdate(updates).status).toBe("success");
    expect(firstUpdate(updates).provider_transaction_id).toBe("tx-1");
  });

  it("links the order and notifies exactly once on success", async () => {
    stubSupabase(makePayment());
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "success",
      responseCode: "0000",
      message: "",
      transactionId: "tx-1",
      externalTransactionId: null,
      amount: 250.75,
      raw: {},
    });

    await verifyAndSettlePayment("TOM_1_abcdef");

    expect(linkOrderToPayment).toHaveBeenCalledTimes(1);
    expect(createOrderNotifications).toHaveBeenCalledTimes(1);
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1);
  });

  it("preserves order_id in metadata so the double-payment guard still works", async () => {
    const updates = stubSupabase(makePayment());
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "success",
      responseCode: "0000",
      message: "",
      transactionId: "tx-1",
      externalTransactionId: null,
      amount: 250.75,
      raw: { data: { status: "Paid" } },
    });

    await verifyAndSettlePayment("TOM_1_abcdef");

    expect(firstUpdate(updates).metadata).toMatchObject({ order_id: ORDER_ID });
  });

  it("leaves a payment pending while Hubtel still says pending", async () => {
    const updates = stubSupabase(makePayment());
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "pending",
      responseCode: "0001",
      message: "",
      transactionId: null,
      externalTransactionId: null,
      amount: null,
      raw: {},
    });

    const result = await verifyAndSettlePayment("TOM_1_abcdef");

    expect(result.status).toBe("pending");
    expect(updates).toHaveLength(0);
    expect(linkOrderToPayment).not.toHaveBeenCalled();
  });

  it("marks a declined prompt failed without touching the order", async () => {
    const updates = stubSupabase(makePayment());
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "failed",
      responseCode: "0000",
      message: "",
      transactionId: "tx-2",
      externalTransactionId: null,
      amount: null,
      raw: { data: { status: "Unpaid" } },
    });

    const result = await verifyAndSettlePayment("TOM_1_abcdef");

    expect(result.status).toBe("failed");
    expect(firstUpdate(updates).status).toBe("failed");
    expect(linkOrderToPayment).not.toHaveBeenCalled();
  });

  it("rejects an underpayment instead of crediting the order", async () => {
    const updates = stubSupabase(makePayment({ amount: 25075 }));
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "success",
      responseCode: "0000",
      message: "",
      transactionId: "tx-3",
      externalTransactionId: null,
      amount: 1, // GHS 1 against a GHS 250.75 order
      raw: {},
    });

    await expect(verifyAndSettlePayment("TOM_1_abcdef")).rejects.toThrow(
      /does not match/i,
    );

    expect(firstUpdate(updates).status).toBe("failed");
    expect(linkOrderToPayment).not.toHaveBeenCalled();
  });

  it("is idempotent — a settled payment is never re-processed", async () => {
    const updates = stubSupabase(makePayment({ status: "success" }));

    const result = await verifyAndSettlePayment("TOM_1_abcdef");

    expect(result.status).toBe("success");
    expect(getTransactionStatus).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(createOrderNotifications).not.toHaveBeenCalled();
  });

  it("settles once when a callback and a poll race the same payment", async () => {
    // Simulate the competing settler winning the CAS just before we write:
    // by the time our update lands, the row is no longer pending.
    let raced = false;
    const updates = stubSupabase(makePayment(), (current) => {
      if (raced || !current) return current;
      raced = true;
      return { ...current, status: "success" };
    });

    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "success",
      responseCode: "0000",
      message: "",
      transactionId: "tx-1",
      externalTransactionId: null,
      amount: 250.75,
      raw: {},
    });

    const result = await verifyAndSettlePayment("TOM_1_abcdef");

    expect(result.status).toBe("success");
    // The loser wrote nothing and fired no side effects.
    expect(updates).toHaveLength(0);
    expect(linkOrderToPayment).not.toHaveBeenCalled();
    expect(createOrderNotifications).not.toHaveBeenCalled();
    expect(sendOrderStatusEmail).not.toHaveBeenCalled();
  });

  it("surfaces a 502 when the status check is unreachable", async () => {
    stubSupabase(makePayment());
    vi.mocked(getTransactionStatus).mockRejectedValue(new Error("network"));

    await expect(verifyAndSettlePayment("TOM_1_abcdef")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("404s on an unknown reference", async () => {
    stubSupabase(null);

    await expect(verifyAndSettlePayment("TOM_1_nope")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ── handleHubtelCallback ──────────────────────────────────────────────────────

describe("handleHubtelCallback", () => {
  it("re-verifies with Hubtel rather than trusting the callback body", async () => {
    stubSupabase(makePayment());
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "failed",
      responseCode: "0000",
      message: "",
      transactionId: null,
      externalTransactionId: null,
      amount: null,
      raw: { data: { status: "Unpaid" } },
    });

    // A forged callback claiming success must not settle the payment.
    await handleHubtelCallback({
      ResponseCode: "0000",
      Data: { ClientReference: "TOM_1_abcdef" },
    });

    expect(getTransactionStatus).toHaveBeenCalledWith("TOM_1_abcdef");
    expect(linkOrderToPayment).not.toHaveBeenCalled();
  });

  it("ignores a callback with no ClientReference", async () => {
    stubSupabase(makePayment());

    const result = await handleHubtelCallback({ ResponseCode: "0000", Data: {} });

    expect(result.message).toMatch(/Missing ClientReference/i);
    expect(getTransactionStatus).not.toHaveBeenCalled();
  });

  it("ignores a callback for a reference we never issued", async () => {
    stubSupabase(null);

    const result = await handleHubtelCallback({
      Data: { ClientReference: "TOM_1_unknown" },
    });

    expect(result.message).toMatch(/not found/i);
    expect(getTransactionStatus).not.toHaveBeenCalled();
  });

  it("flags a late approval of an expired prompt instead of silently dropping it", async () => {
    // We abandoned the prompt as expired; the customer approved it anyway.
    stubSupabase(makePayment({ status: "failed" }));
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "success",
      responseCode: "0000",
      message: "",
      transactionId: "tx-late",
      externalTransactionId: null,
      amount: 250.75,
      raw: {},
    });

    const result = await handleHubtelCallback({
      Data: { ClientReference: "TOM_1_abcdef" },
    });

    expect(result.message).toMatch(/reconciliation/i);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.stringContaining("RECONCILE"),
      expect.objectContaining({ reference: "TOM_1_abcdef" }),
    );
    // Not auto-credited — the customer may have already retried and paid again.
    expect(linkOrderToPayment).not.toHaveBeenCalled();
  });

  it("stays quiet when a failed payment is genuinely unpaid at Hubtel", async () => {
    stubSupabase(makePayment({ status: "failed" }));
    vi.mocked(getTransactionStatus).mockResolvedValue({
      state: "failed",
      responseCode: "0000",
      message: "",
      transactionId: null,
      externalTransactionId: null,
      amount: null,
      raw: {},
    });

    const result = await handleHubtelCallback({
      Data: { ClientReference: "TOM_1_abcdef" },
    });

    expect(result.message).toMatch(/already processed/i);
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  });

  it("short-circuits a replayed callback for an already-settled payment", async () => {
    stubSupabase(makePayment({ status: "success" }));

    const result = await handleHubtelCallback({
      Data: { ClientReference: "TOM_1_abcdef" },
    });

    expect(result.message).toMatch(/already processed/i);
    expect(getTransactionStatus).not.toHaveBeenCalled();
    expect(createOrderNotifications).not.toHaveBeenCalled();
  });
});
