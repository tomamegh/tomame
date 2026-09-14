import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { app: { url: "https://tomame.test" }, paystack: { secretKey: "sk_test", publicKey: "pk_test" } },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/paystack/client", () => ({ verifyTransaction: vi.fn() }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn() }));
vi.mock("@/db/queries/notifications", () => ({
  insertNotification: vi.fn(async (input: Record<string, unknown>) => ({ id: "notif-1", ...input })),
  markNotificationDelivered: vi.fn(async () => undefined),
  getRecipientEmail: vi.fn(async () => "customer@example.com"),
}));
vi.mock("@/db/queries/orders", () => ({ listOrdersByGroup: vi.fn() }));
vi.mock("@/db/queries/order-groups", () => ({ updateOrderGroupStatus: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/orders/services/order-events.service", () => ({ recordOrderEvent: vi.fn() }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => true) }));
vi.mock("@/features/payments/services/payments.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/payments/services/payments.service")>();
  return { ...actual, handlePaymentCallback: vi.fn() };
});
vi.mock("@/features/orders/services/orders.service", () => ({
  getOrderById: vi.fn(), linkOrderToPayment: vi.fn(), sendOrderStatusEmail: vi.fn(),
}));
vi.mock("@/features/payments/services/payment-channels.service", () => ({ getPaymentChannel: vi.fn() }));
vi.mock("@/features/notifications/services/notifications.service", () => ({ createOrderNotifications: vi.fn() }));

import {
  reconcilePendingPayments,
  resolvePaymentTimeouts,
} from "@/features/payments/services/payment-reconciliation.service";
import { handlePaymentCallback } from "@/features/payments/services/payments.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack/client";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { insertNotification, markNotificationDelivered } from "@/db/queries/notifications";
import { listOrdersByGroup } from "@/db/queries/orders";
import { updateOrderGroupStatus } from "@/db/queries/order-groups";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import { sendEmail } from "@/lib/email/transport";
import { logger } from "@/lib/logger";
import { createFakeClient, type FakeDb, type Row } from "./fake-supabase";

const NOW = new Date("2026-09-14T12:00:00Z");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "44444444-4444-4444-8444-444444444444";

let db: FakeDb;

function minutesAgo(m: number): string {
  return new Date(NOW.getTime() - m * 60_000).toISOString();
}

function seedPayment(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: crypto.randomUUID(),
    user_id: USER_ID,
    reference: `TOM_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    amount: 125_050,
    currency: "GHS",
    status: "pending",
    channel: null,
    metadata: { order_id: ORDER_ID },
    order_group_id: null,
    created_at: minutesAgo(30),
    ...overrides,
  };
  db.payments.push(row);
  return row;
}

function seedOrder(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: ORDER_ID,
    user_id: USER_ID,
    status: "pending",
    order_group_id: null,
    product_name: "Sony WH-1000XM5",
    admin_total_ghs: null,
    pricing: { total_ghs: 1250.5 },
    created_at: minutesAgo(49 * 60),
    ...overrides,
  };
  db.orders!.push(row);
  return row;
}

function paystack(status: string) {
  vi.mocked(verifyTransaction).mockResolvedValue({
    status: true, message: "ok",
    data: { id: 1, status: status as "success", reference: "x", amount: 125_050, currency: "GHS", channel: "card", paid_at: null, customer: { email: "c@x" }, metadata: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations; a rejected transport from one test
  // must not leak into the next.
  vi.mocked(sendEmail).mockImplementation(async () => undefined);
  db = { payments: [], orders: [], order_groups: [] };
  vi.mocked(createAdminClient).mockReturnValue(createFakeClient(db) as never);
  vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_expiry_minutes: 60, unpaid_order_ttl_hours: 48 });
  vi.mocked(listOrdersByGroup).mockResolvedValue([]);
  vi.mocked(updateOrderGroupStatus).mockResolvedValue(true);
});

describe("resolvePaymentTimeouts", () => {
  it("reads the admin-set durations", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_expiry_minutes: 30, unpaid_order_ttl_hours: "24" });
    expect(await resolvePaymentTimeouts()).toEqual({ expiryMinutes: 30, unpaidOrderTtlHours: 24 });
  });

  it("falls back to the documented defaults, loudly, when a setting is unusable", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ payment_expiry_minutes: 0, unpaid_order_ttl_hours: "soon" });
    expect(await resolvePaymentTimeouts()).toEqual({ expiryMinutes: 60, unpaidOrderTtlHours: 48 });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

describe("reconcilePendingPayments — verify before anything", () => {
  it("does not ask Paystack about a payment still inside the grace window", async () => {
    seedPayment({ created_at: minutesAgo(2) });
    const summary = await reconcilePendingPayments(NOW);
    expect(verifyTransaction).not.toHaveBeenCalled();
    expect(summary.checked).toBe(0);
  });

  it("settles a payment Paystack reports as successful through the normal callback path", async () => {
    const p = seedPayment();
    paystack("success");
    vi.mocked(handlePaymentCallback).mockImplementation(async () => {
      p.status = "success";
      return { redirectUrl: "x" };
    });

    const summary = await reconcilePendingPayments(NOW);

    expect(handlePaymentCallback).toHaveBeenCalledWith(p.reference);
    expect(summary).toMatchObject({ checked: 1, settled: 1, expired: 0 });
  });

  it("records a payment Paystack reports as failed through the same path", async () => {
    const p = seedPayment();
    paystack("failed");
    vi.mocked(handlePaymentCallback).mockImplementation(async () => {
      p.status = "failed";
      return { redirectUrl: "x" };
    });

    const summary = await reconcilePendingPayments(NOW);
    expect(summary).toMatchObject({ checked: 1, failed: 1 });
  });

  it("leaves an abandoned payment pending while it is younger than the expiry", async () => {
    seedPayment({ created_at: minutesAgo(30) });
    paystack("abandoned");

    const summary = await reconcilePendingPayments(NOW);

    expect(db.payments[0]!.status).toBe("pending");
    expect(summary).toMatchObject({ checked: 1, leftPending: 1, expired: 0 });
    expect(handlePaymentCallback).not.toHaveBeenCalled();
  });

  it("releases an abandoned payment older than the expiry, audits it and tells the customer", async () => {
    const p = seedPayment({ created_at: minutesAgo(90) });
    paystack("abandoned");

    const summary = await reconcilePendingPayments(NOW);

    expect(summary).toMatchObject({ checked: 1, expired: 1 });
    expect(p.status).toBe("failed");
    expect((p.metadata as Record<string, unknown>).expired_at).toBe(NOW.toISOString());
    expect((p.metadata as Record<string, unknown>).order_id).toBe(ORDER_ID);
    expect(vi.mocked(logAuditEvent).mock.calls.map(([e]) => e.action)).toEqual(["payment_expired"]);
    expect(insertNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "payment_expired", user_id: USER_ID }));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].html).toContain(`/app/orders/${ORDER_ID}`);
    expect(markNotificationDelivered).toHaveBeenCalledWith("notif-1", expect.objectContaining({ status: "sent" }));
  });

  it("sends a bag's customer back to the bag to pay again", async () => {
    seedPayment({ created_at: minutesAgo(90), metadata: {}, order_group_id: GROUP_ID });
    paystack("abandoned");
    await reconcilePendingPayments(NOW);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].html).toContain("/app/bag");
  });

  it("leaves a payment pending when Paystack cannot be reached, for the next run", async () => {
    seedPayment({ created_at: minutesAgo(90) });
    vi.mocked(verifyTransaction).mockRejectedValue(new Error("Paystack API error: 503"));

    const summary = await reconcilePendingPayments(NOW);

    expect(db.payments[0]!.status).toBe("pending");
    expect(summary).toMatchObject({ unreachable: 1, expired: 0 });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("does not let a failed mail stop the release", async () => {
    seedPayment({ created_at: minutesAgo(90) });
    paystack("abandoned");
    vi.mocked(sendEmail).mockRejectedValue(new Error("Resend error"));

    const summary = await reconcilePendingPayments(NOW);

    expect(summary.expired).toBe(1);
    expect(markNotificationDelivered).toHaveBeenCalledWith("notif-1", expect.objectContaining({ status: "failed" }));
  });
});

describe("reconcilePendingPayments — unpaid orders and bags", () => {
  it("closes a single order nobody has paid for after the lifetime, with audit, timeline and mail", async () => {
    const order = seedOrder();

    const summary = await reconcilePendingPayments(NOW);

    expect(summary.ordersCancelled).toBe(1);
    expect(order.status).toBe("cancelled");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "order_expired_unpaid", entityId: ORDER_ID }));
    expect(recordOrderEvent).toHaveBeenCalledWith(expect.objectContaining({ order_id: ORDER_ID, kind: "cancelled" }));
    expect(insertNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "order_expired_unpaid" }));
    expect(vi.mocked(sendEmail).mock.calls[0]![0].html).toContain("Sony WH-1000XM5");
  });

  it("keeps a young unpaid order", async () => {
    const order = seedOrder({ created_at: minutesAgo(5 * 60) });
    const summary = await reconcilePendingPayments(NOW);
    expect(order.status).toBe("pending");
    expect(summary.ordersCancelled).toBe(0);
  });

  it("never closes an order that has a pending or successful payment", async () => {
    const order = seedOrder();
    // A stuck payment that Paystack says is still open: released only by the
    // payment half, never by the order half in the same run.
    seedPayment({ created_at: minutesAgo(30) });
    paystack("abandoned");

    const summary = await reconcilePendingPayments(NOW);

    expect(order.status).toBe("pending");
    expect(summary.ordersCancelled).toBe(0);
  });

  it("closes an unpaid bag and every order in it as one", async () => {
    db.order_groups!.push({ id: GROUP_ID, user_id: USER_ID, item_count: 2, total_pesewas: 200_000, status: "pending", created_at: minutesAgo(50 * 60) });
    const a = seedOrder({ id: "a1", order_group_id: GROUP_ID });
    const b = seedOrder({ id: "b2", order_group_id: GROUP_ID });
    vi.mocked(listOrdersByGroup).mockResolvedValue([a, b] as never);

    const summary = await reconcilePendingPayments(NOW);

    expect(updateOrderGroupStatus).toHaveBeenCalledWith(GROUP_ID, "pending", "cancelled");
    expect(summary).toMatchObject({ groupsCancelled: 1, ordersCancelled: 2 });
    expect(a.status).toBe("cancelled");
    expect(b.status).toBe("cancelled");
    expect(vi.mocked(logAuditEvent).mock.calls.map(([e]) => e.action)).toContain("order_group_expired_unpaid");
    // One mail for the bag, not one per line.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].html).toContain("Your bag of 2 items");
  });

  it("skips a bag with a payment in flight", async () => {
    db.order_groups!.push({ id: GROUP_ID, user_id: USER_ID, item_count: 1, total_pesewas: 200_000, status: "pending", created_at: minutesAgo(50 * 60) });
    seedPayment({ created_at: minutesAgo(30), metadata: {}, order_group_id: GROUP_ID });
    paystack("abandoned");

    const summary = await reconcilePendingPayments(NOW);
    expect(updateOrderGroupStatus).not.toHaveBeenCalled();
    expect(summary.groupsCancelled).toBe(0);
  });
});
