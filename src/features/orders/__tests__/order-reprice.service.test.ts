import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(async (cur: string) => ({ USD: 15, GBP: 20 })[cur] ?? null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/payments/services/payments.service", () => ({ findActivePayment: vi.fn() }));
vi.mock("@/features/bag/services/bag.service", () => ({ loadBoxConstants: vi.fn() }));
vi.mock("@/features/quotes/services/quote-lock.service", () => ({ extractionUnderLock: vi.fn((e: unknown) => e) }));
vi.mock("@/db/queries/quote-locks", () => ({ getQuoteLockById: vi.fn() }));
vi.mock("@/db/queries/orders", () => ({
  listOrdersByGroup: vi.fn(),
  listUnpaidCalculatedOrders: vi.fn(),
  updateUnpaidOrderPricing: vi.fn(),
}));
vi.mock("@/db/queries/order-groups", () => ({ getOrderGroupById: vi.fn(), updateOrderGroupTotals: vi.fn() }));

import { TomameCategory } from "@/config/categories/tomame_category";
import * as orders from "@/db/queries/orders";
import * as groups from "@/db/queries/order-groups";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { loadBoxConstants } from "@/features/bag/services/bag.service";
import { priceExtractionWith } from "@/features/extraction/quote.service";
import { withProductDefaults, type ExtractionResult } from "@/features/extraction/types";
import { repriceUnpaidOrders } from "@/features/orders/services/order-reprice.service";
import type { Order } from "@/features/orders/types";
import { findActivePayment } from "@/features/payments/services/payments.service";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { PricingCalculator } from "@/lib/pricing";

/** Phones: flat GHS freight. Laptops: by weight. */
function calculator(phoneFreightGhs: number, ratePerLb = 5): PricingCalculator {
  const calc = new PricingCalculator();
  calc.setConstants({
    freight_rate_per_lb: ratePerLb, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0,
    tax_pct_usa: 0.1, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.05,
  });
  const group = { flat_rate_expression: null, value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null, is_active: true, sort_order: 0 };
  calc.setCategoryPricing(new Map([
    [TomameCategory.CELL_PHONES, { ...group, id: "g1", slug: "phones", name: "Phones", flat_rate_ghs: phoneFreightGhs, default_weight_lbs: null, requires_weight: false }],
    [TomameCategory.COMPUTERS, { ...group, id: "g2", slug: "laptops", name: "Laptops", flat_rate_ghs: null, flat_rate_expression: "weight", default_weight_lbs: 5, requires_weight: true }],
  ]));
  return calc;
}

function snapshot(product: Record<string, unknown>, country: "USA" | "UK" = "USA"): ExtractionResult {
  return {
    extraction_attempted: true, extraction_success: true, platform: "ebay", country,
    product: withProductDefaults({ title: "Pixel 9", price: 499, currency: "USD", category: TomameCategory.CELL_PHONES, ...product }),
    messages: [], errors: [], source: "scraperapi", sources: ["scraperapi"], confidence: {}, fetched_at: "2026-10-16T00:00:00Z",
  };
}

/** An order as intake would have struck it under `at`. */
async function placed(id: string, extraction: ExtractionResult, at: PricingCalculator, extra: Partial<Order> = {}): Promise<Order> {
  const { pricing } = await priceExtractionWith(at, extraction, 1, null, null);
  return {
    id, status: "pending", quantity: 1, origin_country: extraction.country ?? "USA", needs_review: false, admin_total_ghs: null,
    extraction_metadata: extraction, pricing: pricing!, order_group_id: null, created_at: "2026-10-16T10:00:00Z", ...extra,
  } as Order;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findActivePayment).mockResolvedValue(null);
  vi.mocked(orders.updateUnpaidOrderPricing).mockResolvedValue(true);
  vi.mocked(groups.updateOrderGroupTotals).mockResolvedValue(true);
  vi.mocked(loadBoxConstants).mockResolvedValue({ box_capacity_lbs: 50, consolidation_saving_pct: 0.1, minimum_chargeable_weight_lbs: 1 });
});

const ctx = { actorId: "admin-1", reason: "pricing_group_updated" };

describe("repriceUnpaidOrders", () => {
  it("writes nothing when the admin pricing has not changed", async () => {
    const order = await placed("o1", snapshot({}), calculator(100));
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([order]);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(100));

    const out = await repriceUnpaidOrders(ctx);
    expect(out).toMatchObject({ scanned: 1, ordersRepriced: 0, skippedNotReproducible: 0 });
    expect(orders.updateUnpaidOrderPricing).not.toHaveBeenCalled();
  });

  it("moves an unpaid order to the new freight and audits it", async () => {
    const order = await placed("o1", snapshot({}), calculator(100));
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([order]);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(160));

    const out = await repriceUnpaidOrders(ctx);
    expect(out.ordersRepriced).toBe(1);
    const written = vi.mocked(orders.updateUnpaidOrderPricing).mock.calls[0]![2];
    expect(written.flat_rate_ghs).toBe(160);
    expect(written.total_ghs).toBe(order.pricing.total_ghs + 60);
    expect(written.subtotal_usd).toBe(order.pricing.subtotal_usd);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "order_repriced", entityId: "o1", metadata: expect.objectContaining({ total_ghs: { from: order.pricing.total_ghs, to: written.total_ghs } }),
    }));
  });

  it("keeps the FX the order was placed at, so a rate move does not reprice it", async () => {
    const order = await placed("o1", snapshot({}), calculator(100));
    // Today's rate is 16, the order was struck at 15.
    const today = calculator(100);
    today.useGhsRates({ USD: 16 });
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([order]);
    vi.mocked(loadPricingCalculator).mockResolvedValue(today);

    expect((await repriceUnpaidOrders(ctx)).ordersRepriced).toBe(0);
  });

  it("reproduces a GBP listing with store shipping at its own cross rate", async () => {
    const order = await placed("o1", snapshot({ price: 300, currency: "GBP", store_shipping: 12 }, "UK"), calculator(100));
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([order]);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(130));

    const out = await repriceUnpaidOrders(ctx);
    expect(out).toMatchObject({ ordersRepriced: 1, skippedNotReproducible: 0 });
    const written = vi.mocked(orders.updateUnpaidOrderPricing).mock.calls[0]![2];
    expect(written.item_price_usd).toBe(order.pricing.item_price_usd);
    expect(written.store_shipping_usd).toBe(order.pricing.store_shipping_usd);
    expect(written.total_ghs).toBe(order.pricing.total_ghs + 30);
  });

  it("keeps a customer's gap-filled price", async () => {
    const extraction = snapshot({ price: null });
    const { pricing } = await priceExtractionWith(calculator(100), extraction, 1, { itemPriceUsd: 250 }, null);
    const order = { ...(await placed("o1", snapshot({}), calculator(100))), extraction_metadata: extraction, pricing: pricing! } as Order;
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([order]);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(140));

    await repriceUnpaidOrders(ctx);
    const written = vi.mocked(orders.updateUnpaidOrderPricing).mock.calls[0]![2];
    expect(written.item_price_usd).toBe(250);
    expect(written.flat_rate_ghs).toBe(140);
  });

  it("leaves an order alone while a payment is open on it", async () => {
    const order = await placed("o1", snapshot({}), calculator(100));
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([order]);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(160));
    vi.mocked(findActivePayment).mockResolvedValue({ id: "p1", status: "pending" } as never);

    expect(await repriceUnpaidOrders(ctx)).toMatchObject({ ordersRepriced: 0, skippedPaymentOpen: 1 });
    expect(orders.updateUnpaidOrderPricing).not.toHaveBeenCalled();
  });

  it("skips an order whose snapshot no longer gives its item price", async () => {
    const order = await placed("o1", snapshot({}), calculator(100));
    const drifted = { ...order, pricing: { ...order.pricing, subtotal_usd: 480 } } as Order;
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([drifted]);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(160));

    expect(await repriceUnpaidOrders(ctx)).toMatchObject({ ordersRepriced: 0, skippedNotReproducible: 1 });
  });

  it("re-prices a bag's lines and re-strikes the group with the new saving", async () => {
    const before = calculator(100, 5);
    const laptop = snapshot({ title: "ThinkPad", price: 900, category: TomameCategory.COMPUTERS, weight_lbs: 4 });
    const a = await placed("a", laptop, before, { order_group_id: "g1", created_at: "2026-10-16T10:00:00Z" });
    const b = await placed("b", { ...laptop, product: { ...laptop.product, title: "ThinkPad 2" } }, before, { order_group_id: "g1", created_at: "2026-10-16T10:00:01Z" });
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([a, b]);
    vi.mocked(orders.listOrdersByGroup).mockResolvedValue([a, b]);
    vi.mocked(groups.getOrderGroupById).mockResolvedValue({
      id: "g1", status: "pending", delivery_fee_ghs: 40, consolidation_saving_ghs: 0, total_ghs: 1,
    } as never);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(100, 6));

    const out = await repriceUnpaidOrders(ctx);
    expect(out).toMatchObject({ ordersRepriced: 2, groupsRepriced: 1 });
    const patch = vi.mocked(groups.updateOrderGroupTotals).mock.calls[0]![1];
    const lines = vi.mocked(orders.updateUnpaidOrderPricing).mock.calls.map((c) => c[2]);
    // $6/lb × 4 lb at 15 = 360 freight ex handling per line; 10% of the box's 720.
    expect(patch.consolidation_saving_ghs).toBe(72);
    expect(patch.total_ghs).toBe(Math.round((lines[0]!.total_ghs + lines[1]!.total_ghs - 72 + 40) * 100) / 100);
    expect(patch.total_pesewas).toBe(Math.round(patch.total_ghs! * 100));
  });

  it("leaves a bag alone when one of its lines has an admin-set price", async () => {
    const a = await placed("a", snapshot({}), calculator(100), { order_group_id: "g1" });
    const b = { ...(await placed("b", snapshot({}), calculator(100))), order_group_id: "g1", admin_total_ghs: 900 } as Order;
    vi.mocked(orders.listUnpaidCalculatedOrders).mockResolvedValue([a]);
    vi.mocked(orders.listOrdersByGroup).mockResolvedValue([a, b]);
    vi.mocked(groups.getOrderGroupById).mockResolvedValue({ id: "g1", status: "pending" } as never);
    vi.mocked(loadPricingCalculator).mockResolvedValue(calculator(160));

    await repriceUnpaidOrders(ctx);
    expect(orders.updateUnpaidOrderPricing).not.toHaveBeenCalled();
    expect(groups.updateOrderGroupTotals).not.toHaveBeenCalled();
  });
});
