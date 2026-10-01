import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(async (cur: string) => ({ USD: 15, GBP: 20 })[cur] ?? null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn() }));

import { PricingCalculator } from "@/lib/pricing";
import { TomameCategory } from "@/config/categories/tomame_category";
import { priceExtractionWith, storeShippingCurrencyOf } from "../quote.service";
import { withProductDefaults, type ExtractionResult } from "../types";

function calculator(): PricingCalculator {
  const calc = new PricingCalculator();
  calc.setConstants({
    freight_rate_per_lb: 5, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0,
    tax_pct_usa: 0.1, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.05,
  });
  calc.setCategoryPricing(new Map([[TomameCategory.CELL_PHONES, {
    id: "g", slug: "phones", name: "Phones", flat_rate_ghs: 100, flat_rate_expression: null,
    value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null,
    default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0,
  }]]));
  return calc;
}

function ebay(product: Record<string, unknown>, country: "USA" | "UK" = "USA"): ExtractionResult {
  return {
    extraction_attempted: true, extraction_success: true, platform: "ebay", country,
    product: withProductDefaults({ title: "MacBook Pro 14", price: 599.99, currency: "USD", category: TomameCategory.CELL_PHONES, ...product }),
    messages: [], errors: [], source: "scraperapi", sources: ["scraperapi"], confidence: {}, fetched_at: "2026-09-30T00:00:00Z",
  };
}

describe("priceExtractionWith: store shipping from the snapshot", () => {
  it("charges the snapshot's per-unit shipping × quantity", async () => {
    const { pricing } = await priceExtractionWith(calculator(), ebay({ store_shipping: 24 }), 2, null, null);
    expect(pricing?.store_shipping_usd).toBe(48);
  });

  it("prices unknown shipping as 0", async () => {
    const { pricing } = await priceExtractionWith(calculator(), ebay({ store_shipping: null }), 1, null, null);
    expect(pricing?.store_shipping_usd).toBeUndefined();
    expect(pricing?.total_ghs).toBe((599.99 + 60 + 30) * 15 + 100);
  });

  it("never re-prices a pre-field cache row from metadata.shippingCost", async () => {
    const { pricing } = await priceExtractionWith(calculator(), ebay({ metadata: { shippingCost: 24 } }), 1, null, null);
    expect(pricing?.store_shipping_usd).toBeUndefined();
    expect(pricing?.total_ghs).toBe((599.99 + 60 + 30) * 15 + 100);
  });

  it("prices Amazon store shipping as 0 even when a snapshot carries one", async () => {
    const amazon = { ...ebay({ store_shipping: 9 }), platform: "amazon" };
    const { pricing } = await priceExtractionWith(calculator(), amazon, 1, null, null);
    expect(pricing?.store_shipping_usd).toBeUndefined();
  });

  it("uses the store's currency, not the gap-filled USD, when the listing currency is unknown", async () => {
    const { pricing } = await priceExtractionWith(
      calculator(), ebay({ price: null, currency: null, store_shipping: 3 }, "UK"), 1, { itemPriceUsd: 50 }, null,
    );
    expect(pricing?.store_shipping_currency).toBe("GBP");
    expect(pricing?.store_shipping_usd).toBe(4); // £3 × 20 / 15
  });

  it("keeps a GBP listing's shipping in GBP when the customer fills the price in USD", async () => {
    const { pricing } = await priceExtractionWith(
      calculator(), ebay({ price: null, currency: "GBP", store_shipping: 3 }, "UK"), 1, { itemPriceUsd: 50 }, null,
    );
    expect(pricing?.item_price_usd).toBe(50);
    expect(pricing?.store_shipping_usd).toBe(4); // 3 × 20 / 15
  });
});

describe("storeShippingCurrencyOf", () => {
  it("prefers the page, then the store registry, then the region", () => {
    expect(storeShippingCurrencyOf(ebay({ currency: "GBP" }), "USA")).toBe("GBP");
    expect(storeShippingCurrencyOf(ebay({ currency: null }), "UK")).toBe("GBP");
    expect(storeShippingCurrencyOf(ebay({ currency: null }), "USA")).toBe("USD");
    expect(storeShippingCurrencyOf({ ...ebay({ currency: null }), platform: "generic" }, "CHINA")).toBe("CNY");
  });
});
