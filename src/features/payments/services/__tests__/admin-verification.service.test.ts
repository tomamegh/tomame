import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/paystack/client", () => ({ verifyTransaction: vi.fn() }));
vi.mock("@/db/queries/notifications", () => ({ getRecipientEmail: vi.fn(async () => "customer@example.com") }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/payments/services/payments.service", () => ({ handlePaymentCallback: vi.fn() }));

import {
  lookupPaystackReference,
  settlePaystackReference,
} from "@/features/payments/services/admin-verification.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack/client";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { handlePaymentCallback } from "@/features/payments/services/payments.service";
import { createFakeClient, type FakeDb, type Row } from "./fake-supabase";

const REFERENCE = "TOM_1792016963655_9337bd0c874c";
const GROUP_ID = "44444444-4444-4444-8444-444444444444";
const ADMIN = { id: "99999999-9999-4999-8999-999999999999" };

let db: FakeDb;

function seed(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: "11111111-1111-4111-8111-111111111111",
    reference: REFERENCE,
    amount: 385_836,
    currency: "GHS",
    status: "failed",
    metadata: { order_group_id: GROUP_ID },
    order_group_id: GROUP_ID,
    car_order_id: null,
    created_at: "2026-10-14T22:29:23Z",
    ...overrides,
  };
  db.payments.push(row);
  db.orders!.push({ id: "o1", order_no: "TM-00010", product_name: "Grille", status: "pending", order_group_id: GROUP_ID, created_at: "2026-10-14T22:29:22Z" });
  return row;
}

function paystack(status: string, amount = 385_836) {
  vi.mocked(verifyTransaction).mockResolvedValue({
    status: true, message: "ok",
    data: { id: 1, status: status as "success", reference: REFERENCE, amount, currency: "GHS", channel: "mobile_money", paid_at: "2026-10-14T22:41:00Z", customer: { email: "c@x" }, metadata: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db = { payments: [], orders: [] };
  vi.mocked(createAdminClient).mockReturnValue(createFakeClient(db) as never);
});

describe("lookupPaystackReference", () => {
  it("offers a settle when Paystack has the full amount on a payment we hold as failed", async () => {
    seed();
    paystack("success");

    const lookup = await lookupPaystackReference(`  ${REFERENCE} `);

    expect(lookup.canSettle).toBe(true);
    expect(lookup.blockedReason).toBeNull();
    expect(lookup.payment).toMatchObject({ status: "failed", customerEmail: "customer@example.com" });
    expect(lookup.orders).toEqual([{ id: "o1", orderNo: "TM-00010", productName: "Grille", status: "pending" }]);
  });

  it("refuses when Paystack has no money on the reference", async () => {
    seed();
    paystack("abandoned");
    const lookup = await lookupPaystackReference(REFERENCE);
    expect(lookup.canSettle).toBe(false);
    expect(lookup.blockedReason).toContain("abandoned");
  });

  it("refuses when Paystack's amount differs from ours", async () => {
    seed();
    paystack("success", 100);
    expect((await lookupPaystackReference(REFERENCE)).canSettle).toBe(false);
  });

  it("refuses a reference that is on Paystack but not in Tomame", async () => {
    paystack("success");
    const lookup = await lookupPaystackReference(REFERENCE);
    expect(lookup.payment).toBeNull();
    expect(lookup.canSettle).toBe(false);
  });

  it("refuses an already-paid payment", async () => {
    seed({ status: "success" });
    paystack("success");
    expect((await lookupPaystackReference(REFERENCE)).blockedReason).toBe("Already paid. Nothing to do.");
  });

  it("says plainly when Paystack does not know the reference", async () => {
    vi.mocked(verifyTransaction).mockRejectedValue(new Error("Paystack API error: 400"));
    await expect(lookupPaystackReference(REFERENCE)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects input that is not a reference before calling Paystack", async () => {
    await expect(lookupPaystackReference("a b; drop")).rejects.toMatchObject({ statusCode: 400 });
    expect(verifyTransaction).not.toHaveBeenCalled();
  });
});

describe("settlePaystackReference", () => {
  it("settles through the payment callback and audits the admin who pressed it", async () => {
    const p = seed();
    paystack("success");
    vi.mocked(handlePaymentCallback).mockImplementation(async () => {
      p.status = "success";
      db.orders![0]!.status = "paid";
      return { redirectUrl: "x" };
    });

    const result = await settlePaystackReference(ADMIN, REFERENCE);

    expect(handlePaymentCallback).toHaveBeenCalledWith(REFERENCE);
    expect(result.settled).toBe(true);
    expect(result.lookup.orders[0]!.status).toBe("paid");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: ADMIN.id,
      actorRole: "admin",
      action: "payment_settled_by_admin",
      metadata: expect.objectContaining({ from: "failed", to: "success", settled: true }),
    }));
  });

  it("refuses, without touching anything, when Paystack does not confirm", async () => {
    seed();
    paystack("failed");

    await expect(settlePaystackReference(ADMIN, REFERENCE)).rejects.toMatchObject({ statusCode: 409 });
    expect(handlePaymentCallback).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
