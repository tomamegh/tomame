import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { PricingCalculator } from "@/lib/pricing";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";

const RATES: Record<string, number> = { USD: 15, GBP: 20, CNY: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhsRate).mockImplementation(async (cur: string) => RATES[cur] ?? null);
});

function group(overrides: Partial<PricingGroupRow> = {}): PricingGroupRow {
  return {
    id: "g", slug: "phones", name: "Phones", flat_rate_ghs: 1200, flat_rate_expression: null,
    value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null,
    default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0, ...overrides,
  };
}

function constants(overrides: Partial<Parameters<PricingCalculator["setConstants"]>[0]> = {}) {
  return {
    freight_rate_per_lb: 5, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0,
    tax_pct_usa: 0.1, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.05, ...overrides,
  };
}

describe("multi-currency item prices", () => {
  it("converts a GBP listing to USD via the GBP→GHS / USD→GHS cross rate", async () => {
    const calc = new PricingCalculator();
    calc.setConstants(constants());
    calc.setCategoryPricing(new Map([[TomameCategory.CELL_PHONES, group()]]));

    const r = await calc.calculate({ itemPrice: 100, itemCurrency: "GBP", quantity: 1, category: TomameCategory.CELL_PHONES, region: "uk" });
    expect(r.item_price).toBe(100);
    expect(r.item_currency).toBe("GBP");
    expect(r.item_price_usd).toBeCloseTo(133.33, 2); // 100 × 20 / 15
    expect(r.subtotal_usd).toBeCloseTo(133.33, 2);
    expect(r.pricing_method).toBe("flat_rate");
  });

  it("USD listings pass through unchanged and itemPriceUsd still works", async () => {
    const calc = new PricingCalculator();
    calc.setCategoryPricing(new Map([[TomameCategory.CELL_PHONES, group()]]));
    const a = await calc.calculate({ itemPrice: 50, itemCurrency: "USD", quantity: 1, category: TomameCategory.CELL_PHONES });
    const b = await calc.calculate({ itemPriceUsd: 50, quantity: 1, category: TomameCategory.CELL_PHONES });
    expect(a.item_price_usd).toBe(50);
    expect(b.item_price_usd).toBe(50);
    expect(b.item_currency).toBe("USD");
  });

  it("throws 503 when the store currency has no stored rate", async () => {
    const calc = new PricingCalculator();
    calc.setCategoryPricing(new Map([[TomameCategory.CELL_PHONES, group()]]));
    await expect(
      calc.calculate({ itemPrice: 10, itemCurrency: "EUR", quantity: 1, category: TomameCategory.CELL_PHONES }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("fixed freight items", () => {
  it("matches the longest keyword in the title and charges the negotiated rate", async () => {
    const calc = new PricingCalculator();
    calc.setConstants(constants());
    calc.setCategoryPricing(new Map([[TomameCategory.CELL_PHONES, group({ value_percentage: 0.05 })]]));
    calc.setFixedFreightItems([
      { id: "1", category: "IPHONE", product_name: "iPhone 15", freight_rate_ghs: 900, keywords: ["iphone 15"], sort_order: 1 },
      { id: "2", category: "IPHONE", product_name: "iPhone 15 Pro & Max", freight_rate_ghs: 1000, keywords: ["iphone 15 pro", "iphone 15 pro max"], sort_order: 0 },
    ]);
    const r = await calc.calculate({
      itemPriceUsd: 999, quantity: 1, category: TomameCategory.CELL_PHONES,
      productTitle: "Apple iPhone 15 Pro Max 256GB - Natural Titanium",
    });
    expect(r.pricing_method).toBe("fixed_freight");
    expect(r.fixed_freight_item).toBe("iPhone 15 Pro & Max");
    expect(r.flat_rate_ghs).toBe(1000);
    expect(r.value_fee_percentage).toBe(0.05);
    expect(r.total_ghs).toBeCloseTo((999 + 99.9 + 49.95) * 15 + 1000, 1);
  });

  it("uses the default value fee when a fixed item matches but no group does", async () => {
    const calc = new PricingCalculator();
    calc.setConstants(constants({ default_value_fee_pct: 0.07 }));
    calc.setCategoryPricing(new Map());
    calc.setFixedFreightItems([{ id: "1", category: "X", product_name: "PS5", freight_rate_ghs: 1500, keywords: ["playstation 5"], sort_order: 0 }]);
    const r = await calc.calculate({ itemPriceUsd: 500, quantity: 1, category: null, productTitle: "Sony PlayStation 5 Console" });
    expect(r.pricing_method).toBe("fixed_freight");
    expect(r.value_fee_percentage).toBe(0.07);
  });
});

describe("minimum chargeable weight", () => {
  it("floors a light listed weight to the minimum before the formula runs", async () => {
    const calc = new PricingCalculator();
    calc.setConstants(constants({ minimum_chargeable_weight_lbs: 2 }));
    calc.setCategoryPricing(new Map([[TomameCategory.AUTOMOTIVE, group({ slug: "car_parts", name: "Car Parts", flat_rate_ghs: null, flat_rate_expression: "5 + (w / 8)" })]]));
    const r = await calc.calculate({ itemPriceUsd: 20, quantity: 1, category: TomameCategory.AUTOMOTIVE, weightLbs: 0.5 });
    expect(r.pricing_method).toBe("weight_expression");
    expect(r.weight_lbs).toBe(2);
    expect(r.weight_source).toBe("minimum");
    expect(r.freight_usd).toBe(13); // 2 lb × $5 + $3
    expect(r.flat_rate_ghs).toBeCloseTo(13 * 15, 2); // fx buffer 0 in this test
    expect(r.fee_calculation_note).toContain("2 lb (minimum)");
  });

  it("scales freight with quantity but charges handling once", async () => {
    const calc = new PricingCalculator();
    calc.setConstants(constants({ freight_rate_per_lb: 6, handling_fee_usd: 4 }));
    calc.setCategoryPricing(new Map([[TomameCategory.HOME_KITCHEN, group({ slug: "home_kitchen", name: "Home & Kitchen", flat_rate_ghs: null, flat_rate_expression: "legacy" })]]));
    const r = await calc.calculate({ itemPriceUsd: 80, quantity: 2, category: TomameCategory.HOME_KITCHEN, weightLbs: 36.2 });
    expect(r.freight_usd).toBeCloseTo(36.2 * 2 * 6 + 4, 2);
    expect(r.flat_rate_ghs).toBeCloseTo((36.2 * 2 * 6 + 4) * 15, 1);
    expect(r.freight_rate_per_lb).toBe(6);
    expect(r.handling_fee_usd).toBe(4);
  });
});
