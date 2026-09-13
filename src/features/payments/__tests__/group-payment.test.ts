import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" }, paystack: { secretKey: "sk_test", publicKey: "pk_test" } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/paystack/client", () => ({ initializeTransaction: vi.fn(), verifyTransaction: vi.fn(), generatePaymentReference: vi.fn(() => "TOM_1_ab") }));
vi.mock("@/features/orders/services/orders.service", () => ({ getOrderById: vi.fn(), linkOrderToPayment: vi.fn(), sendOrderStatusEmail: vi.fn() }));
vi.mock("@/db/queries/orders", () => ({ listOrdersByGroup: vi.fn(async () => []) }));
vi.mock("@/db/queries/order-groups", () => ({ getOrderGroupById: vi.fn(), updateOrderGroupStatus: vi.fn(async () => true) }));
vi.mock("@/features/payments/services/payment-channels.service", () => ({ getPaymentChannel: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/notifications/services/notifications.service", () => ({ createOrderNotifications: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { initializeTransaction, verifyTransaction } from "@/lib/paystack/client";
import { linkOrderToPayment, sendOrderStatusEmail } from "@/features/orders/services/orders.service";
import { listOrdersByGroup } from "@/db/queries/orders";
import { getOrderGroupById, updateOrderGroupStatus, type OrderGroupRow } from "@/db/queries/order-groups";
import { getPaymentChannel } from "@/features/payments/services/payment-channels.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createOrderNotifications } from "@/features/notifications/services/notifications.service";
import { getOrderById } from "@/features/orders/services/orders.service";
import { handlePaymentCallback, initializePayment } from "@/features/payments/services/payments.service";
import { createFakeClient, type FakeDb } from "../services/__tests__/fake-supabase";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "@/features/orders/types";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const user = { id: "u1", email: "k@x.test", profile: { role: "user" } } as unknown as PlatformUser;

const group = (over: Partial<OrderGroupRow> = {}): OrderGroupRow => ({
  id: GROUP_ID, user_id: "u1", payment_id: null, delivery_address_id: "a1", delivery_zone_id: "z1", delivery_address: null, item_count: 3,
  subtotal_usd: 30, tax_usd: 3, fee_usd: 2, freight_ghs: 60, consolidation_saving_ghs: 12, delivery_fee_ghs: 20, total_ghs: 1234.56, total_pesewas: 123456,
  status: "pending", created_at: "", updated_at: "", ...over,
});
const orders = ["o1", "o2", "o3"].map((id) => ({ id, product_name: `P ${id}`, pricing: { total_ghs: 400 }, admin_total_ghs: null }) as unknown as Order);

let db: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = { payments: [] };
  vi.mocked(createAdminClient).mockReturnValue(createFakeClient(db) as never);
  vi.mocked(getOrderGroupById).mockResolvedValue(group());
  vi.mocked(listOrdersByGroup).mockResolvedValue(orders);
  vi.mocked(getPaymentChannel).mockResolvedValue({ id: "mtn", label: "MTN MoMo", paystack_channel: "mobile_money", provider: "mtn", dot: null });
  vi.mocked(initializeTransaction).mockResolvedValue({ status: true, message: "", data: { authorization_url: "https://pay/x", access_code: "", reference: "TOM_1_ab" } });
  vi.mocked(linkOrderToPayment).mockImplementation(async (_c, id) => orders.find((o) => o.id === id) ?? null);
});

describe("initializePayment — order group", () => {
  it("charges the group's own pesewas over the chosen channel and ties the payment to the group", async () => {
    const result = await initializePayment(user, { orderGroupId: GROUP_ID, channel: "mtn" });

    expect(initializeTransaction).toHaveBeenCalledWith(expect.objectContaining({
      amount: 123456, channels: ["mobile_money"], metadata: { order_group_id: GROUP_ID, order_ids: ["o1", "o2", "o3"] },
    }));
    expect(db.payments[0]).toMatchObject({
      amount: 123456, status: "pending", order_group_id: GROUP_ID,
      metadata: { order_group_id: GROUP_ID, order_ids: ["o1", "o2", "o3"], requested_channel: "mtn", provider: "mtn" },
    });
    expect(result.payment.amount).toBe(123456);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "payment_initialized", metadata: expect.objectContaining({ orderGroupId: GROUP_ID }) }));
  });

  it("offers both channels when none is chosen, and refuses an unknown one", async () => {
    await initializePayment(user, { orderGroupId: GROUP_ID });
    expect(initializeTransaction).toHaveBeenCalledWith(expect.objectContaining({ channels: ["card", "mobile_money"] }));

    vi.mocked(getPaymentChannel).mockResolvedValue(null);
    db.payments = [];
    await expect(initializePayment(user, { orderGroupId: GROUP_ID, channel: "nope" })).rejects.toMatchObject({ statusCode: 400, message: "Choose a payment method" });
  });

  it("409s while a payment for the group is pending or has succeeded", async () => {
    db.payments.push({ id: "p0", user_id: "u1", reference: "TOM_0_x", amount: 123456, status: "pending", order_group_id: GROUP_ID, metadata: {} });
    await expect(initializePayment(user, { orderGroupId: GROUP_ID })).rejects.toMatchObject({ statusCode: 409 });
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("404s a group that is not the caller's; 400s a paid group", async () => {
    vi.mocked(getOrderGroupById).mockResolvedValue(group({ user_id: "someone-else" }));
    await expect(initializePayment(user, { orderGroupId: GROUP_ID })).rejects.toMatchObject({ statusCode: 404 });
    vi.mocked(getOrderGroupById).mockResolvedValue(group({ status: "paid" }));
    await expect(initializePayment(user, { orderGroupId: GROUP_ID })).rejects.toMatchObject({ statusCode: 400, message: "This bag has already been paid" });
  });
});

describe("initializePayment — legacy single order", () => {
  it("refuses to charge one line of a bag on its own", async () => {
    vi.mocked(getOrderById).mockResolvedValue({ id: "o1", user_id: "u1", status: "pending", order_group_id: GROUP_ID, pricing: { total_ghs: 400 }, admin_total_ghs: null } as unknown as Order);
    await expect(initializePayment(user, { orderId: "22222222-2222-4222-8222-222222222222" })).rejects.toMatchObject({ statusCode: 400 });
    expect(initializeTransaction).not.toHaveBeenCalled();
  });
});

describe("handlePaymentCallback — group fan-out", () => {
  const seed = (status = "pending") => {
    db.payments.push({ id: "p1", user_id: "u1", reference: "TOM_1_ab", amount: 123456, currency: "GHS", status, order_group_id: GROUP_ID, metadata: { order_group_id: GROUP_ID } });
  };
  const verified = (status: "success" | "failed") =>
    vi.mocked(verifyTransaction).mockResolvedValue({ status: true, message: "", data: { id: 1, status, reference: "TOM_1_ab", amount: 123456, currency: "GHS", channel: "mobile_money", paid_at: null, customer: { email: "k@x.test" }, metadata: null } });

  it("links every order once, flips the group once, sends one email", async () => {
    seed();
    verified("success");
    const { redirectUrl } = await handlePaymentCallback("TOM_1_ab");

    expect(redirectUrl).toBe(`https://tomame.test/app/orders?payment=success&group=${GROUP_ID}`);
    expect(linkOrderToPayment).toHaveBeenCalledTimes(3);
    for (const id of ["o1", "o2", "o3"]) expect(linkOrderToPayment).toHaveBeenCalledWith(expect.anything(), id, "p1");
    expect(createOrderNotifications).toHaveBeenCalledTimes(3);
    expect(updateOrderGroupStatus).toHaveBeenCalledTimes(1);
    expect(updateOrderGroupStatus).toHaveBeenCalledWith(GROUP_ID, "pending", "paid", { payment_id: "p1" });
    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(1);
    expect(sendOrderStatusEmail).toHaveBeenCalledWith("u1", orders[0], "paid");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "order_group_paid", entityId: GROUP_ID }));
    expect(vi.mocked(logAuditEvent).mock.calls.filter(([e]) => e.action === "order_status_changed")).toHaveLength(3);
    expect(db.payments[0]!.status).toBe("success");
  });

  it("a second delivery of the same charge runs no effects", async () => {
    seed("success");
    verified("success");
    const { redirectUrl } = await handlePaymentCallback("TOM_1_ab");
    expect(redirectUrl).toContain(`group=${GROUP_ID}`);
    expect(verifyTransaction).not.toHaveBeenCalled();
    expect(linkOrderToPayment).not.toHaveBeenCalled();
    expect(updateOrderGroupStatus).not.toHaveBeenCalled();
    expect(sendOrderStatusEmail).not.toHaveBeenCalled();
  });

  it("an order already paid by an earlier partial pass is skipped, not re-notified", async () => {
    seed();
    verified("success");
    vi.mocked(linkOrderToPayment).mockImplementation(async (_c, id) => (id === "o1" ? null : orders.find((o) => o.id === id) ?? null));
    await handlePaymentCallback("TOM_1_ab");
    expect(createOrderNotifications).toHaveBeenCalledTimes(2);
    expect(sendOrderStatusEmail).toHaveBeenCalledWith("u1", orders[1], "paid");
  });

  it("a failed charge leaves the group pending and sends the customer back to the bag", async () => {
    seed();
    verified("failed");
    const { redirectUrl } = await handlePaymentCallback("TOM_1_ab");
    expect(redirectUrl).toBe("https://tomame.test/app/bag?payment=failed");
    expect(linkOrderToPayment).not.toHaveBeenCalled();
    expect(updateOrderGroupStatus).not.toHaveBeenCalled();
    expect(db.payments[0]!.status).toBe("failed");
  });
});
