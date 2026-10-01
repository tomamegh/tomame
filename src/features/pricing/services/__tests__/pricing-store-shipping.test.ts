import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { PricingCalculator } from "@/lib/pricing";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";

const RATES: Record<string, number> = { USD: 15, GBP: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhsRate).mockImplementation(async (cur: string) => RATES[cur] ?? null);
});

function calculator(): PricingCalculator {
  const group: PricingGroupRow = {
    id: "g", slug: "phones", name: "Phones", flat_rate_ghs: 100, flat_rate_expression: null,
    value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null,
    default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0,
  };
  const calc = new PricingCalculator();
  calc.setConstants({
    freight_rate_per_lb: 5, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0,
    tax_pct_usa: 0.1, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.05,
  });
  calc.setCategoryPricing(new Map([[TomameCategory.CELL_PHONES, group]]));
  return calc;
}

const base = { category: TomameCategory.CELL_PHONES, region: "usa" as const };

describe("store shipping", () => {
  it("adds per-unit shipping × quantity, with no tax and no fee on it", async () => {
    const r = await calculator().calculate({ ...base, itemPrice: 600, itemCurrency: "USD", quantity: 2, storeShipping: 24 }, null);
    // item 1200, tax 120, fee 60 — all on the item only; shipping 24 × 2 = 48.
    expect(r.tax_usd).toBe(120);
    expect(r.value_fee_usd).toBe(60);
    expect(r.store_shipping).toBe(24);
    expect(r.store_shipping_currency).toBe("USD");
    expect(r.store_shipping_usd).toBe(48);
    expect(r.store_shipping_ghs).toBe(720);
    expect(r.flat_rate_ghs).toBe(200);
    expect(r.total_ghs).toBe((1200 + 120 + 60 + 48) * 15 + 200);
    expect(r.fee_calculation_note).toContain("store shipping $24.00 × 2");
  });

  it("prices null / missing shipping as 0 and leaves the note alone", async () => {
    const calc = calculator();
    const none = await calc.calculate({ ...base, itemPrice: 600, itemCurrency: "USD", quantity: 1, storeShipping: null }, null);
    const absent = await calc.calculate({ ...base, itemPrice: 600, itemCurrency: "USD", quantity: 1 }, null);
    for (const r of [none, absent]) {
      expect(r.store_shipping_usd).toBeUndefined();
      expect(r.total_ghs).toBe((600 + 60 + 30) * 15 + 100);
      expect(r.fee_calculation_note).not.toContain("store shipping");
    }
  });

  it("converts a GBP listing's shipping like its price", async () => {
    const r = await calculator().calculate({ ...base, region: "uk", itemPrice: 100, itemCurrency: "GBP", quantity: 1, storeShipping: 6 }, null);
    expect(r.store_shipping_currency).toBe("GBP");
    expect(r.store_shipping_usd).toBe(8); // 6 × 20 / 15
    expect(r.total_ghs).toBeCloseTo((133.33 + 13.33 + 6.67 + 8) * 15 + 100, 1);
  });

  it("keeps the listing currency when the item price is a USD gap-filler", async () => {
    const r = await calculator().calculate(
      { ...base, itemPriceUsd: 50, quantity: 1, storeShipping: 3, storeShippingCurrency: "GBP" },
      null,
    );
    expect(r.store_shipping_usd).toBe(4); // 3 × 20 / 15
  });

  it("converts through a lock's frozen cross rates", async () => {
    const r = await calculator().calculate(
      { ...base, itemPrice: 100, itemCurrency: "GBP", quantity: 1, storeShipping: 6 },
      { exchange_rate: 16, mid_market_rate: 16, cross_rates: { USD: 16, GBP: 24 } },
    );
    expect(r.store_shipping_usd).toBe(9); // 6 × 24 / 16
    expect(getGhsRate).not.toHaveBeenCalled();
  });
});
