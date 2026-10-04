import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/features/warehouse/services/inbound.service", () => ({ registerInboundTracking: vi.fn() }));
vi.mock("../orders.service", () => ({ getOrderById: vi.fn(), updateOrderStatusAdmin: vi.fn() }));

import { registerInboundTracking } from "@/features/warehouse/services/inbound.service";
import type { InboundParcel } from "@/features/warehouse/types";
import type { PlatformUser } from "@/features/users/types";
import { updateOrderStatusSchema } from "../../schema";
import type { Order } from "../../types";
import { markOrderPurchased } from "../order-purchase.service";
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
