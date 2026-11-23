import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/features/warehouse/services/inbound.service", () => ({ registerInboundTracking: vi.fn() }));
vi.mock("../orders.service", () => ({ getOrderById: vi.fn(), updateOrderStatusAdmin: vi.fn() }));
vi.mock("@/db/queries/order-store-price", () => ({ recordStorePaidPrice: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));

import { recordStorePaidPrice } from "@/db/queries/order-store-price";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { registerInboundTracking } from "@/features/warehouse/services/inbound.service";
import type { InboundParcel } from "@/features/warehouse/types";
import type { PlatformUser } from "@/features/users/types";
import { purchaseOrdersSchema, updateOrderStatusSchema } from "../../schema";
import type { Order } from "../../types";
import { markOrderPurchased, markOrdersPurchased } from "../order-purchase.service";
import { getOrderById, updateOrderStatusAdmin } from "../orders.service";

const admin = { id: "admin-1", email: "a@tomame.test", profile: { role: "admin" } } as unknown as PlatformUser;
const order = (over: Partial<Order> = {}) => ({ id: "o1", status: "paid", held_at: null, hold_reason: null, ...over }) as unknown as Order;
const parcel = (n: string) => ({ id: `p-${n}`, carrier_label: "UPS", tracking_display: n }) as unknown as InboundParcel;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrderById).mockResolvedValue(order());
  vi.mocked(updateOrderStatusAdmin).mockResolvedValue(order({ status: "processing" }));
  vi.mocked(registerInboundTracking).mockImplementation(async (_u, input) => parcel(input.tracking_number));
});

describe("markOrderPurchased", () => {
  it("registers each store parcel as expected, then moves the order to processing", async () => {
    const result = await markOrderPurchased(admin, "o1", {
      store_tracking: [{ tracking_number: "1Z999AA10123456784", store_order_ref: "114-1" }, { tracking_number: "  " }],
    });
    expect(registerInboundTracking).toHaveBeenCalledTimes(1);
    expect(registerInboundTracking).toHaveBeenCalledWith(admin, { order_id: "o1", tracking_number: "1Z999AA10123456784", store_order_ref: "114-1" });
    expect(updateOrderStatusAdmin).toHaveBeenCalledWith(expect.anything(), admin, "o1", "processing", undefined, {});
    expect(result.parcels).toHaveLength(1);
  });

  it("puts the store tracking on the customer's email only when asked", async () => {
    await markOrderPurchased(admin, "o1", { store_tracking: [{ tracking_number: "1Z999AA10123456784" }], share_store_tracking: true });
    expect(updateOrderStatusAdmin).toHaveBeenCalledWith(expect.anything(), admin, "o1", "processing", undefined, {
      customerStoreTracking: [{ carrier: "UPS", number: "1Z999AA10123456784" }],
    });
  });

  it("records what the store charged, after the move, with the drift from the quote (A0b)", async () => {
    vi.mocked(getOrderById).mockResolvedValue(
      order({ extraction_metadata: { platform: "amazon", price_source: "scraperapi", source: "scraperapi", product: { price: 80, currency: "USD" } } } as unknown as Partial<Order>),
    );
    await markOrderPurchased(admin, "o1", { store_paid_price: 84, store_paid_currency: "usd" });
    expect(recordStorePaidPrice).toHaveBeenCalledWith({ orderId: "o1", price: 84, currency: "USD", by: "admin-1" });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order_store_price_recorded",
        entityId: "o1",
        metadata: expect.objectContaining({ quoted_price: 80, drift: 0.05, platform: "amazon", price_source: "scraperapi" }),
      }),
    );
  });

  it("records no store price when none is given, or when the move is refused", async () => {
    await markOrderPurchased(admin, "o1", {});
    vi.mocked(getOrderById).mockResolvedValue(order({ status: "processing" }));
    await expect(markOrderPurchased(admin, "o1", { store_paid_price: 10 })).rejects.toMatchObject({ statusCode: 400 });
    expect(recordStorePaidPrice).not.toHaveBeenCalled();
  });

  it("accepts the store price on the wire", () => {
    const parsed = updateOrderStatusSchema.safeParse({ status: "processing", store_paid_price: "83.55", store_paid_currency: "usd" });
    expect(parsed.success && parsed.data.store_paid_price).toBe(83.55);
    expect(parsed.success && parsed.data.store_paid_currency).toBe("USD");
  });

  it("works with no tracking at all", async () => {
    await markOrderPurchased(admin, "o1", {});
    expect(registerInboundTracking).not.toHaveBeenCalled();
    expect(updateOrderStatusAdmin).toHaveBeenCalledOnce();
  });

  it("refuses before writing anything: a bad number, a held order, an order that is not paid", async () => {
    await expect(markOrderPurchased(admin, "o1", { store_tracking: [{ tracking_number: "abc" }] })).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(getOrderById).mockResolvedValue(order({ held_at: "2026-10-04T00:00:00Z", hold_reason: "Address check" }));
    await expect(markOrderPurchased(admin, "o1", { store_tracking: [{ tracking_number: "1Z999AA10123456784" }] })).rejects.toMatchObject({ statusCode: 409 });
    vi.mocked(getOrderById).mockResolvedValue(order({ status: "processing" }));
    await expect(markOrderPurchased(admin, "o1", {})).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(getOrderById).mockResolvedValue(null);
    await expect(markOrderPurchased(admin, "o1", {})).rejects.toMatchObject({ statusCode: 404 });
    expect(registerInboundTracking).not.toHaveBeenCalled();
    expect(updateOrderStatusAdmin).not.toHaveBeenCalled();
  });
});

describe("updateOrderStatusSchema — store tracking", () => {
  it("is accepted only when marking purchased", () => {
    expect(updateOrderStatusSchema.safeParse({ status: "processing", store_tracking: [{ tracking_number: "1Z999AA101" }], share_store_tracking: true }).success).toBe(true);
    expect(updateOrderStatusSchema.safeParse({ status: "in_transit", store_tracking: [{ tracking_number: "1Z999AA101" }] }).success).toBe(false);
    expect(updateOrderStatusSchema.safeParse({ status: "processing", store_tracking: Array(6).fill({ tracking_number: "1Z999AA101" }) }).success).toBe(false);
  });
});

describe("markOrdersPurchased — one store order for the whole checkout", () => {
  it("moves each order, puts the same tracking on each, and records a price only where given", async () => {
    vi.mocked(getOrderById).mockImplementation(async (_c, id) => order({ id }));
    vi.mocked(updateOrderStatusAdmin).mockImplementation(async (_c, _u, id) => order({ id, status: "processing" }));
    const result = await markOrdersPurchased(admin, ["o1", "o2", "o2"], {
      store_tracking: [{ tracking_number: "1Z999AA10123456784" }],
      store_paid_prices: { o1: 11.24 },
      store_paid_currency: "USD",
    });
    expect(result.purchased.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(result.refused).toEqual([]);
    expect(registerInboundTracking).toHaveBeenCalledTimes(2);
    expect(recordStorePaidPrice).toHaveBeenCalledTimes(1);
    expect(recordStorePaidPrice).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", price: 11.24 }));
  });

  it("refuses an order on hold by itself and still moves the rest", async () => {
    vi.mocked(getOrderById).mockImplementation(async (_c, id) => (id === "o2" ? order({ id, held_at: "2026-11-23T10:00:00Z", hold_reason: "Address check" }) : order({ id })));
    vi.mocked(updateOrderStatusAdmin).mockImplementation(async (_c, _u, id) => order({ id, status: "processing" }));
    const result = await markOrdersPurchased(admin, ["o1", "o2", "o3"], {});
    expect(result.purchased.map((o) => o.id)).toEqual(["o1", "o3"]);
    expect(result.refused).toEqual([{ order_id: "o2", reason: expect.stringContaining("Address check") }]);
  });

  it("needs no tracking and no prices on the wire", () => {
    const ok = purchaseOrdersSchema.safeParse({ order_ids: ["78ff6e0e-3aa5-4c76-b9e5-0854d853bf9a"] });
    expect(ok.success).toBe(true);
    expect(purchaseOrdersSchema.safeParse({ order_ids: [] }).success).toBe(false);
  });
});
