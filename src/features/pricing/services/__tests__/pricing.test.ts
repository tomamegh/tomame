import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock exchange rate service
vi.mock("@/lib/exchange-rates/service", () => ({
  getGhsRate: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The three DB reads loadPricingCalculator makes.
vi.mock("@/db/queries/pricing-constants", () => ({ getPricingConstantsMap: vi.fn() }));
vi.mock("@/db/queries/pricing-groups", () => ({ getCategoryPricingMap: vi.fn(async () => new Map()) }));
vi.mock("@/db/queries/fixed-freight-items", () => ({ getActiveFixedFreightItems: vi.fn(async () => []) }));

import { PricingCalculator } from "@/lib/pricing";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { getCategoryPricingMap } from "@/db/queries/pricing-groups";
import { loadPricingCalculator } from "../pricing.service";
import { logger } from "@/lib/logger";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePricingGroup(overrides: Partial<PricingGroupRow> = {}): PricingGroupRow {
  return {
    id: "test-id",
    slug: "test_group",
    name: "Test Group",
    flat_rate_ghs: 500,
    flat_rate_expression: null,
    value_percentage: 0.05,
    value_percentage_high: null,
    value_threshold_usd: null,
    default_weight_lbs: null,
    requires_weight: false,
    is_active: true,
    sort_order: 0,
    ...overrides,
  };
}

function buildCategoryMap(
  entries: [string, Partial<PricingGroupRow>][],
): Map<string, PricingGroupRow> {
  const map = new Map<string, PricingGroupRow>();
  for (const [category, overrides] of entries) {
    map.set(category, makePricingGroup(overrides));
  }
  return map;
}

/**
 * The constants the calculator used to invent for itself when nobody set any:
 * 10% tax everywhere, a 4% FX buffer, $5/lb + $3 handling, no tax floor, no
 * weight floor, a 5% service fee. They are spelled out here so these tests keep
 * asserting the exact numbers they always did — a complete set must price
 * byte-identically to the old hardcoded fallbacks — while an unconfigured
 * calculator is now free to refuse.
 */
function constants(overrides: Partial<Parameters<PricingCalculator["setConstants"]>[0]> = {}) {
  return {
    freight_rate_per_lb: 5,
    handling_fee_usd: 3,
    minimum_tax_usd: 0,
    fx_buffer_pct: 0.04,
    tax_pct_usa: 0.1,
    tax_pct_uk: 0.1,
    tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 0,
    default_value_fee_pct: 0.05,
    ...overrides,
  };
}

// ── Tests: JSON fallback (no setCategoryPricing) ────────────────────────────

describe("PricingCalculator (JSON fallback)", () => {
  describe("Flat Rate (phones)", () => {
    it("Cell phone → flat_rate with phones pricing group", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 799,
        quantity: 1,
        category: TomameCategory.CELL_PHONES,
      }, null);

      expect(result.pricing_method).toBe("flat_rate");
      expect(result.pricing_group).toBe("phones");
      expect(result.flat_rate_ghs).toBe(1200);
      expect(result.value_fee_percentage).toBe(0.05);
      expect(result.tax_percentage).toBe(0.1);
      expect(result.tax_usd).toBeCloseTo(79.9, 1);
      expect(result.value_fee_usd).toBeCloseTo(39.95, 1);
      expect(result.total_ghs).toBeGreaterThan(15000);
      expect(result.total_pesewas).toBe(Math.round(result.total_ghs * 100));
    });

    it("quantity multiplies subtotal correctly", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 3,
        category: TomameCategory.CELL_PHONES,
      }, null);

      expect(result.subtotal_usd).toBe(300);
      expect(result.tax_usd).toBeCloseTo(30, 1);
      expect(result.value_fee_usd).toBeCloseTo(15, 1);
    });
  });

  describe("Flat Rate (phone accessories)", () => {
    it("Headphones → flat_rate with phone_accessories group", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 50,
        quantity: 1,
        category: TomameCategory.HEADPHONES,
      }, null);

      expect(result.pricing_method).toBe("flat_rate");
      expect(result.pricing_group).toBe("phone_accessories");
      expect(result.flat_rate_ghs).toBe(250);
      expect(result.value_fee_percentage).toBe(0.04);
    });
  });

  describe("total_usd (the \u2248 $ echo beside the cedi total)", () => {
    it("is the landed total divided by the rate actually applied", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 50,
        quantity: 1,
        category: TomameCategory.HEADPHONES,
      }, null);

      // The screen prints these two side by side, so they must agree exactly.
      // Not `/ 15.2`: the applied rate carries the FX buffer, and dividing by
      // the mid-market rate would print a dollar figure nobody is charged.
      expect(result.total_usd).toBeCloseTo(result.total_ghs / result.exchange_rate, 2);
      expect(result.total_usd).toBeGreaterThan(0);
    });

    it("covers freight too, not just the USD components", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 50,
        quantity: 1,
        category: TomameCategory.HEADPHONES,
      }, null);

      // flat_rate_ghs is GH\u20b5250 of freight. A total_usd built by summing only
      // the USD lines would silently omit it and under-state the echo.
      const usdLinesOnly = result.subtotal_usd + result.tax_usd + result.value_fee_usd;
      expect(result.total_usd).toBeGreaterThan(usdLinesOnly);
    });

    it("is zero on needs_review, where there is no total to echo", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 50,
        quantity: 1,
        category: null,
      }, null);

      expect(result.pricing_method).toBe("needs_review");
      expect(result.total_ghs).toBe(0);
      expect(result.total_usd).toBe(0);
    });
  });

  describe("Weight Expression (car parts)", () => {
    it("car part with weight → weight_expression pricing", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: TomameCategory.AUTOMOTIVE,
        weightLbs: 16,
      }, null);

      expect(result.pricing_method).toBe("weight_expression");
      expect(result.pricing_group).toBe("car_parts");
      expect(result.value_fee_percentage).toBe(0.08);
      // weight-based: 16 lb × $5/lb + $3 handling = $83, converted at the applied rate
      expect(result.freight_usd).toBe(83);
      expect(result.flat_rate_ghs).toBeCloseTo(83 * result.exchange_rate, 1);
      expect(result.weight_lbs).toBe(16);
      expect(result.fee_calculation_note).toContain("16 lb × $5/lb + $3 handling");
      expect(result.total_ghs).toBeGreaterThan(0);
    });

    it("car part without weight → needs_review", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: TomameCategory.AUTOMOTIVE,
      }, null);

      expect(result.pricing_method).toBe("needs_review");
      expect(result.pricing_group).toBe("car_parts");
      expect(result.total_ghs).toBe(0);
      expect(result.review_reason).toContain("weight");
    });
  });

  describe("Needs Review (unmapped category)", () => {
    it("returns needs_review when category has no pricing group", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: "Some Unknown Category",
      }, null);

      expect(result.pricing_method).toBe("needs_review");
      expect(result.pricing_group).toBeNull();
      expect(result.total_ghs).toBe(0);
      expect(result.total_pesewas).toBe(0);
      expect(result.review_reason).toBeTruthy();
    });

    it("returns needs_review when no category provided", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
      }, null);

      expect(result.pricing_method).toBe("needs_review");
      expect(result.review_reason).toContain("determine the product category");
    });
  });

  describe("Exchange Rate", () => {
    it("throws when exchange rate is not available", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(null);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      await expect(
        calc.calculate({
          itemPriceUsd: 100,
          quantity: 1,
          category: TomameCategory.CELL_PHONES,
        }, null),
      ).rejects.toThrow("Exchange rate for USD/GHS not available");
    });

    it("applies FX buffer to mid-market rate", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: TomameCategory.CELL_PHONES,
      }, null);

      expect(result.mid_market_rate).toBe(15.0);
      expect(result.exchange_rate).toBeCloseTo(15.6, 1);
    });

    it("caches FX rate across multiple calculations", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      await calc.calculate({ itemPriceUsd: 100, quantity: 1, category: TomameCategory.CELL_PHONES }, null);
      await calc.calculate({ itemPriceUsd: 200, quantity: 1, category: TomameCategory.HEADPHONES }, null);

      expect(getGhsRate).toHaveBeenCalledTimes(1);
    });
  });
});

// ── Tests: DB-loaded category pricing (setCategoryPricing) ──────────────────

describe("PricingCalculator (DB-loaded)", () => {
  describe("Flat Rate via DB", () => {
    it("uses DB-loaded pricing group instead of JSON", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          ["Custom Category", { slug: "custom", name: "Custom", flat_rate_ghs: 800, value_percentage: 0.06 }],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: "Custom Category",
      }, null);

      expect(result.pricing_method).toBe("flat_rate");
      expect(result.pricing_group).toBe("custom");
      expect(result.flat_rate_ghs).toBe(800);
      expect(result.value_fee_percentage).toBe(0.06);
      expect(result.total_ghs).toBeGreaterThan(0);
    });

    it("unmapped category in DB map → needs_review", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(new Map()); // empty map

      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: "Unknown",
      }, null);

      expect(result.pricing_method).toBe("needs_review");
    });
  });

  describe("Tiered Value Percentage", () => {
    it("uses base percentage when subtotal is under threshold", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Electronics",
            {
              slug: "electronics",
              name: "Electronics",
              flat_rate_ghs: 500,
              value_percentage: 0.08,
              value_percentage_high: 0.05,
              value_threshold_usd: 100,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 50,
        quantity: 1,
        category: "Electronics",
      }, null);

      expect(result.value_fee_percentage).toBe(0.08);
      expect(result.value_fee_usd).toBeCloseTo(4.0, 2);
    });

    it("uses high percentage when subtotal exceeds threshold", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Electronics",
            {
              slug: "electronics",
              name: "Electronics",
              flat_rate_ghs: 500,
              value_percentage: 0.08,
              value_percentage_high: 0.05,
              value_threshold_usd: 100,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: "Electronics",
      }, null);

      expect(result.value_fee_percentage).toBe(0.05);
      expect(result.value_fee_usd).toBeCloseTo(10.0, 2);
    });

    it("uses base percentage when no tiering configured", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Electronics",
            {
              slug: "electronics",
              name: "Electronics",
              flat_rate_ghs: 500,
              value_percentage: 0.06,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 500,
        quantity: 1,
        category: "Electronics",
      }, null);

      expect(result.value_fee_percentage).toBe(0.06);
    });
  });

  describe("Default Weight Fallback", () => {
    it("uses default_weight_lbs when input weight is missing", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Speakers",
            {
              slug: "speakers",
              name: "Speakers",
              flat_rate_ghs: null,
              flat_rate_expression: "5 + (w / 8)",
              default_weight_lbs: 10,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: "Speakers",
      }, null);

      expect(result.pricing_method).toBe("weight_expression");
      // default 10 lb × $5/lb + $3 = $53
      expect(result.freight_usd).toBe(53);
      expect(result.flat_rate_ghs).toBeCloseTo(53 * result.exchange_rate, 1);
      expect(result.weight_lbs).toBe(10);
      expect(result.weight_source).toBe("default");
    });

    it("prefers input weight over default weight", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Speakers",
            {
              slug: "speakers",
              name: "Speakers",
              flat_rate_ghs: null,
              flat_rate_expression: "5 + (w / 8)",
              default_weight_lbs: 10,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: "Speakers",
        weightLbs: 24,
      }, null);

      expect(result.pricing_method).toBe("weight_expression");
      // 24 lb × $5/lb + $3 = $123
      expect(result.freight_usd).toBe(123);
      expect(result.flat_rate_ghs).toBeCloseTo(123 * result.exchange_rate, 1);
      expect(result.weight_lbs).toBe(24);
      expect(result.weight_source).toBe("listed");
    });

    it("needs_review when no weight and no default", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Speakers",
            {
              slug: "speakers",
              name: "Speakers",
              flat_rate_ghs: null,
              flat_rate_expression: "5 + (w / 8)",
              default_weight_lbs: null,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: "Speakers",
      }, null);

      expect(result.pricing_method).toBe("needs_review");
      expect(result.review_reason).toContain("weight");
    });
  });

  describe("Requires Weight", () => {
    it("returns needs_review with rejection reason when requires_weight and no weight", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Car Parts",
            {
              slug: "car_parts",
              name: "Car Parts",
              flat_rate_ghs: null,
              flat_rate_expression: "5 + (w / 8)",
              requires_weight: true,
              default_weight_lbs: null,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: "Car Parts",
      }, null);

      expect(result.pricing_method).toBe("needs_review");
      expect(result.pricing_group).toBe("car_parts");
      expect(result.review_reason).toContain("requires weight");
      expect(result.review_reason).toContain("Car Parts");
      expect(result.total_ghs).toBe(0);
    });

    it("calculates normally when requires_weight and weight is provided", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setConstants(constants());
      calc.setCategoryPricing(
        buildCategoryMap([
          [
            "Car Parts",
            {
              slug: "car_parts",
              name: "Car Parts",
              flat_rate_ghs: null,
              flat_rate_expression: "5 + (w / 8)",
              requires_weight: true,
            },
          ],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: "Car Parts",
        weightLbs: 16,
      }, null);

      expect(result.pricing_method).toBe("weight_expression");
      expect(result.freight_usd).toBe(83);
      expect(result.total_ghs).toBeGreaterThan(0);
    });
  });
});

// ── Tests: unconfigured constants ───────────────────────────────────────────

/**
 * The guard that stopped the pricing path inventing numbers. Until a complete
 * set of `pricing_constants` reaches the calculator there is no freight rate,
 * no tax tier and no FX buffer to price with — and a total assembled from
 * literals chosen in code is a real amount charged to a real customer that
 * nobody decided on. So it reviews, exactly like a category we cannot price.
 */
describe("PricingCalculator without usable constants", () => {
  const PHONES = buildCategoryMap([["Phones", { slug: "phones", name: "Phones", flat_rate_ghs: 1200 }]]);

  it("a calculator nobody configured returns needs_review instead of a total", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);

    const calc = new PricingCalculator();
    calc.setCategoryPricing(PHONES);
    const result = await calc.calculate({ itemPriceUsd: 799, quantity: 1, category: "Phones" }, null);

    expect(result.pricing_method).toBe("needs_review");
    expect(result.total_ghs).toBe(0);
    expect(result.total_pesewas).toBe(0);
    expect(result.total_usd).toBe(0);
    expect(result.review_reason).toBeTruthy();
  });

  it("never touches the exchange rate, because the FX buffer is itself a missing constant", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);

    const calc = new PricingCalculator();
    calc.setCategoryPricing(PHONES);
    const result = await calc.calculate({ itemPriceUsd: 799, quantity: 1, category: "Phones" }, null);

    expect(getGhsRate).not.toHaveBeenCalled();
    expect(result.exchange_rate).toBe(0);
    expect(result.mid_market_rate).toBe(0);
  });

  it("a partial map is not partially usable: one absent key reviews the whole quote", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);

    const partial = constants();
    delete (partial as Partial<typeof partial>).freight_rate_per_lb;

    const calc = new PricingCalculator();
    calc.setConstants(partial);
    calc.setCategoryPricing(PHONES);

    // A flat-rate group does not even read freight_rate_per_lb — and it still
    // refuses, because "which constants does this line happen to need?" is the
    // reasoning that let a guess through in the first place.
    const result = await calc.calculate({ itemPriceUsd: 799, quantity: 1, category: "Phones" }, null);

    expect(calc.missingConstants).toEqual(["freight_rate_per_lb"]);
    expect(result.pricing_method).toBe("needs_review");
    expect(result.total_ghs).toBe(0);
  });

  it("treats a row that is not a finite number as absent, and zero as a real decision", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);

    const nan = new PricingCalculator();
    nan.setConstants(constants({ handling_fee_usd: Number.NaN }));
    expect(nan.missingConstants).toEqual(["handling_fee_usd"]);

    const zero = new PricingCalculator();
    zero.setConstants(constants({ default_value_fee_pct: 0 }));
    zero.setCategoryPricing(PHONES);
    expect(zero.missingConstants).toEqual([]);
    expect((await zero.calculate({ itemPriceUsd: 799, quantity: 1, category: "Phones" }, null)).pricing_method).toBe("flat_rate");
  });

  it("says something a customer can read, and names no constant at them", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);

    const calc = new PricingCalculator();
    calc.setCategoryPricing(PHONES);
    const reason = (await calc.calculate({ itemPriceUsd: 799, quantity: 1, category: "Phones" }, null)).review_reason!;

    expect(reason).toBe("We couldn't work out a price for this item. Our team needs to check it before you can order.");
    for (const key of ["freight_rate_per_lb", "fx_buffer_pct", "pricing_constants", "undefined", "NaN"]) {
      expect(reason).not.toContain(key);
    }
  });

  it("still rejects a priceless line with a 400 rather than reviewing it", async () => {
    const calc = new PricingCalculator();
    calc.setCategoryPricing(PHONES);
    await expect(calc.calculate({ quantity: 1, category: "Phones" }, null)).rejects.toThrow("An item price is required");
  });

  it("a complete set prices exactly as it did before the guard existed", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);

    // Real admin values, not the old code literals, so the check is of the
    // arithmetic and not of a coincidence between two copies of "5" and "3".
    const admin = {
      freight_rate_per_lb: 5.5, handling_fee_usd: 3.25, minimum_tax_usd: 2, fx_buffer_pct: 0.045,
      tax_pct_usa: 0.11, tax_pct_uk: 0.09, tax_pct_china: 0.08,
      minimum_chargeable_weight_lbs: 1.5, default_value_fee_pct: 0.06,
    };

    const flatCalc = new PricingCalculator();
    flatCalc.setConstants(admin);
    flatCalc.setCategoryPricing(
      buildCategoryMap([["Phones", { slug: "phones", name: "Phones", flat_rate_ghs: 1200, value_percentage: 0.05, value_percentage_high: 0.04, value_threshold_usd: 500 }]]),
    );
    // Captured from the calculator as it stood before the guard was added.
    expect(await flatCalc.calculate({ itemPriceUsd: 799, quantity: 1, category: "Phones" }, null)).toEqual({
      pricing_method: "flat_rate", pricing_group: "phones", item_price: 799, item_currency: "USD",
      item_price_usd: 799, quantity: 1, subtotal_usd: 799, exchange_rate: 15.88, mid_market_rate: 15.2,
      tax_percentage: 0.11, tax_usd: 87.89, value_fee_percentage: 0.04, value_fee_usd: 31.96,
      flat_rate_ghs: 1200, total_ghs: 15791.34, total_pesewas: 1579134, total_usd: 994.42,
      fee_calculation_note: "flat rate: Phones",
    });

    const weightCalc = new PricingCalculator();
    weightCalc.setConstants(admin);
    weightCalc.setCategoryPricing(
      buildCategoryMap([["Car Parts", { slug: "car_parts", name: "Car Parts", flat_rate_ghs: null, flat_rate_expression: "w", value_percentage: 0.08 }]]),
    );
    expect(await weightCalc.calculate({ itemPriceUsd: 200, quantity: 2, category: "Car Parts", weightLbs: 0.4 }, null)).toEqual({
      pricing_method: "weight_expression", pricing_group: "car_parts", item_price: 200, item_currency: "USD",
      item_price_usd: 200, quantity: 2, subtotal_usd: 400, exchange_rate: 15.88, mid_market_rate: 15.2,
      tax_percentage: 0.11, tax_usd: 44, value_fee_percentage: 0.08, value_fee_usd: 32,
      flat_rate_ghs: 313.63, total_ghs: 7872.51, total_pesewas: 787251, total_usd: 495.75,
      fee_calculation_note: "1.5 lb (minimum) × 2 × $5.5/lb + $3.25 handling = $19.75",
      weight_lbs: 1.5, weight_source: "minimum", freight_usd: 19.75, freight_rate_per_lb: 5.5, handling_fee_usd: 3.25,
    });
  });
});

// ── Tests: loadPricingCalculator (the DB layer that used to substitute) ─────

describe("loadPricingCalculator", () => {
  const PHONES = buildCategoryMap([["Phones", { slug: "phones", name: "Phones", flat_rate_ghs: 1200 }]]);

  beforeEach(() => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);
    vi.mocked(getCategoryPricingMap).mockResolvedValue(PHONES);
  });

  const price = async () =>
    (await loadPricingCalculator()).calculate({ itemPriceUsd: 799, quantity: 1, category: "Phones" }, null);

  it("prices normally when the table holds every row — the case every real environment is in", async () => {
    vi.mocked(getPricingConstantsMap).mockResolvedValue(constants());

    const result = await price();

    expect(result.pricing_method).toBe("flat_rate");
    expect(result.total_ghs).toBeGreaterThan(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("ignores rows the calculator does not use rather than choking on them", async () => {
    vi.mocked(getPricingConstantsMap).mockResolvedValue({ ...constants(), price_drop_notify_pct: 0.1, some_future_knob: 7 });

    expect((await price()).pricing_method).toBe("flat_rate");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not fill a missing row with a literal: the quote comes back for review", async () => {
    const partial = constants();
    delete (partial as Partial<typeof partial>).fx_buffer_pct;
    vi.mocked(getPricingConstantsMap).mockResolvedValue(partial);

    expect((await price()).pricing_method).toBe("needs_review");
  });

  it("names the missing keys in the log, where an operator can act on them", async () => {
    const partial = constants();
    delete (partial as Partial<typeof partial>).fx_buffer_pct;
    delete (partial as Partial<typeof partial>).minimum_tax_usd;
    vi.mocked(getPricingConstantsMap).mockResolvedValue(partial);

    await price();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("incomplete"),
      expect.objectContaining({ missing: ["minimum_tax_usd", "fx_buffer_pct"] }),
    );
  });

  it("reviews rather than prices when the constants read fails outright", async () => {
    vi.mocked(getPricingConstantsMap).mockRejectedValue(new Error("connection reset"));

    expect((await price()).pricing_method).toBe("needs_review");
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to load pricing constants"), expect.anything());
  });
});
