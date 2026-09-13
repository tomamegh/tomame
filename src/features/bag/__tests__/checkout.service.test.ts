import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/orders/services/orders.service", () => ({ createOrder: vi.fn() }));
vi.mock("@/db/queries/delivery-addresses", () => ({ getDeliveryAddressById: vi.fn(async () => ({ id: "a1", label: "Home", area: "East Legon" })) }));
vi.mock("@/db/queries/orders", () => ({ listOrdersByGroup: vi.fn(async () => []) }));
vi.mock("@/db/queries/carts", () => ({ setCartStatus: vi.fn(async () => true) }));
vi.mock("@/db/queries/order-groups", () => ({
  findLatestPendingGroupForUser: vi.fn(async () => null),
  insertOrderGroup: vi.fn(),
  updateOrderGroupStatus: vi.fn(async () => true),
  updateOrderGroupTotals: vi.fn(async () => true),
}));
vi.mock("../services/bag.service", () => ({ getBag: vi.fn(), resolveCart: vi.fn(), setBagDelivery: vi.fn() }));

import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createOrder } from "@/features/orders/services/orders.service";
import { listOrdersByGroup } from "@/db/queries/orders";
import { setCartStatus } from "@/db/queries/carts";
import * as groups from "@/db/queries/order-groups";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "@/features/orders/types";
import type { PricingBreakdown } from "@/lib/pricing";
import { getBag, resolveCart, setBagDelivery } from "../services/bag.service";
import { checkoutBag } from "../services/checkout.service";
import type { BagLine, BagView } from "../types";

const user = { id: "u1" } as unknown as PlatformUser;
const viewer = { userId: "u1", sessionId: "s1" };

const pricing = (total_ghs: number): PricingBreakdown =>
  ({ subtotal_usd: total_ghs / 10, tax_usd: 1, value_fee_usd: 0.5, flat_rate_ghs: 20, total_ghs, total_usd: total_ghs / 15, exchange_rate: 15 }) as PricingBreakdown;

const line = (id: string, total_ghs: number, over: Partial<BagLine> = {}): BagLine => ({
  id, extraction_cache_id: `cache-${id}`, quantity: 1, special_instructions: null,
  product: { title: `Item ${id}`, image: "https://x/1.jpg", url: `https://www.amazon.com/dp/${id}`, store: "Amazon", variant: null, weight_lbs: 1, country: "USA" },
  pricing: pricing(total_ghs), pricing_unavailable_reason: null, gap_price_usd: null, gap_origin_country: null, ...over,
});

const bag = (over: Partial<BagView> = {}): BagView => ({
  delivery: { kind: "door", address_id: "a1", zone_id: "z1", zone_name: "Greater Accra", label: "Home · East Legon", fee_ghs: 20 },
  delivery_fee_ghs: 20,
  cart_id: "c1",
  lines: [line("a", 100), line("b", 50, { gap_price_usd: 12, gap_origin_country: "UK", special_instructions: "gift" })],
  boxes: [{ id: "box-1", label: "Box 1", region_code: "USA", region_name: "US", departs_at: null, cutoff_at: null, capacity_lbs: 9, weight_lbs: 2, fill_pct: 22, headroom_lbs: 7, line_ids: ["a", "b"], freight_ghs: 40, saving_ghs: 10, marginal_saving_ghs: 4, item_count: 2, unweighed_line_count: 0, has_unweighed_lines: false }],
  unboxed_line_ids: [],
  consolidation_saving_ghs: 10,
  consolidation_saving_pct: 0.2,
  item_count: 2,
  subtotal_usd: 15, tax_usd: 2, fee_usd: 1, freight_ghs: 40, boxed_weight_lbs: 2,
  total_ghs: 160, // 150 − 10 + 20
  total_usd: 10,
  rate_locked_until: null,
  has_unpriced_lines: false,
  ...over,
});

const group = (over: Partial<groups.OrderGroupRow> = {}): groups.OrderGroupRow => ({
  id: "g1", user_id: "u1", payment_id: null, delivery_address_id: "a1", delivery_zone_id: "z1", delivery_address: null, item_count: 2,
  subtotal_usd: 15, tax_usd: 2, fee_usd: 1, freight_ghs: 40, consolidation_saving_ghs: 10, delivery_fee_ghs: 20, total_ghs: 160, total_pesewas: 16000,
  status: "pending", created_at: "", updated_at: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveCart).mockResolvedValue({ id: "c1", user_id: "u1", session_id: null, status: "open", delivery_zone_id: null, delivery_address_id: "a1", order_group_id: null, created_at: "", updated_at: "" });
  vi.mocked(getBag).mockResolvedValue(bag());
  vi.mocked(groups.insertOrderGroup).mockImplementation(async (input) => group({ ...input, id: "g1", payment_id: null, created_at: "", updated_at: "" }));
  let n = 0;
  vi.mocked(createOrder).mockImplementation(async (_c, _u, input) => ({ id: `o${++n}`, pricing: pricing(input.quantity === 1 && input.product_url.endsWith("/a") ? 100 : 50) }) as unknown as Order);
});

describe("checkoutBag", () => {
  it("strikes the group at Σ lines − saving + delivery, one order per line with its links, and flips the cart", async () => {
    const result = await checkoutBag(user, viewer, {});

    expect(groups.insertOrderGroup).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "u1", delivery_address_id: "a1", delivery_zone_id: "z1", item_count: 2,
      consolidation_saving_ghs: 10, delivery_fee_ghs: 20, total_ghs: 160, total_pesewas: 16000, status: "pending",
      delivery_address: expect.objectContaining({ kind: "door", id: "a1", zone_name: "Greater Accra" }),
    }));

    expect(createOrder).toHaveBeenCalledTimes(2);
    const links = { order_group_id: "g1", consolidation_box_id: "box-1", delivery_address_id: "a1", suppress_placed_email: true };
    expect(createOrder).toHaveBeenNthCalledWith(1, expect.anything(), user,
      { product_url: "https://www.amazon.com/dp/a", product_name: "Item a", product_image_url: "https://x/1.jpg", quantity: 1, extraction_cache_id: "cache-a" }, viewer, links);
    expect(createOrder).toHaveBeenNthCalledWith(2, expect.anything(), user,
      expect.objectContaining({ product_url: "https://www.amazon.com/dp/b", estimated_price_usd: 12, origin_country: "UK", special_instructions: "gift" }), viewer, links);

    expect(groups.updateOrderGroupTotals).not.toHaveBeenCalled();
    expect(setCartStatus).toHaveBeenCalledWith("c1", "open", "checked_out", { order_group_id: "g1" });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "order_group_created", entityType: "order_group", entityId: "g1",
      metadata: { order_ids: ["o1", "o2"], total_ghs: 160, total_pesewas: 16000, delivery_fee_ghs: 20, consolidation_saving_ghs: 10 },
    }));
    expect(result).toEqual({ order_group_id: "g1", order_ids: ["o1", "o2"], item_count: 2, total_ghs: 160, total_pesewas: 16000, status: "pending" });
  });

  it("applies a delivery named in the body before pricing", async () => {
    await checkoutBag(user, viewer, { delivery_zone_id: "z-pick" });
    expect(setBagDelivery).toHaveBeenCalledWith(viewer, { delivery_zone_id: "z-pick" });
    expect(vi.mocked(setBagDelivery).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getBag).mock.invocationCallOrder[0]!);
  });

  it("follows the orders when their sum came in lower than the bag showed", async () => {
    vi.mocked(createOrder).mockResolvedValueOnce({ id: "o1", pricing: pricing(90) } as unknown as Order).mockResolvedValueOnce({ id: "o2", pricing: pricing(50) } as unknown as Order);
    const result = await checkoutBag(user, viewer, {});
    // 140 − 10 + 20
    expect(groups.updateOrderGroupTotals).toHaveBeenCalledWith("g1", expect.objectContaining({ total_ghs: 150, total_pesewas: 15000, freight_ghs: 40 }));
    expect(result.total_pesewas).toBe(15000);
  });

  it("400s an empty bag, or returns the pending group a previous checkout made", async () => {
    vi.mocked(resolveCart).mockResolvedValue(null);
    await expect(checkoutBag(user, viewer, {})).rejects.toMatchObject({ statusCode: 400, message: "Your bag is empty" });

    vi.mocked(groups.findLatestPendingGroupForUser).mockResolvedValue(group());
    vi.mocked(listOrdersByGroup).mockResolvedValue([{ id: "o1" }, { id: "o2" }] as Order[]);
    const result = await checkoutBag(user, viewer, {});
    expect(result).toMatchObject({ order_group_id: "g1", order_ids: ["o1", "o2"], total_pesewas: 16000 });
    expect(groups.insertOrderGroup).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("refuses without a delivery choice and with an unpriced line", async () => {
    vi.mocked(getBag).mockResolvedValue(bag({ delivery: null, delivery_fee_ghs: 0 }));
    await expect(checkoutBag(user, viewer, {})).rejects.toMatchObject({ statusCode: 400, message: "Choose where to deliver first" });

    vi.mocked(getBag).mockResolvedValue(bag({ has_unpriced_lines: true }));
    await expect(checkoutBag(user, viewer, {})).rejects.toMatchObject({ statusCode: 409 });
    expect(groups.insertOrderGroup).not.toHaveBeenCalled();
  });

  it("retires the group and keeps the cart open when an order cannot be created", async () => {
    vi.mocked(createOrder).mockResolvedValueOnce({ id: "o1", pricing: pricing(100) } as unknown as Order).mockRejectedValueOnce(new Error("boom"));
    await expect(checkoutBag(user, viewer, {})).rejects.toThrow("boom");
    expect(groups.updateOrderGroupStatus).toHaveBeenCalledWith("g1", "pending", "cancelled");
    expect(setCartStatus).not.toHaveBeenCalled();
  });
});
