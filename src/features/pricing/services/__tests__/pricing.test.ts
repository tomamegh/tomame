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

import { PricingCalculator } from "@/lib/pricing";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";

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

// ── Tests: JSON fallback (no setCategoryPricing) ────────────────────────────

describe("PricingCalculator (JSON fallback)", () => {
  describe("Flat Rate (phones)", () => {
    it("Cell phone → flat_rate with phones pricing group", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      const result = await calc.calculate({
        itemPriceUsd: 799,
        quantity: 1,
        category: TomameCategory.CELL_PHONES,
      });

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
      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 3,
        category: TomameCategory.CELL_PHONES,
      });

      expect(result.subtotal_usd).toBe(300);
      expect(result.tax_usd).toBeCloseTo(30, 1);
      expect(result.value_fee_usd).toBeCloseTo(15, 1);
    });
  });

  describe("Flat Rate (phone accessories)", () => {
    it("Headphones → flat_rate with phone_accessories group", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      const result = await calc.calculate({
        itemPriceUsd: 50,
        quantity: 1,
        category: TomameCategory.HEADPHONES,
      });

      expect(result.pricing_method).toBe("flat_rate");
      expect(result.pricing_group).toBe("phone_accessories");
      expect(result.flat_rate_ghs).toBe(250);
      expect(result.value_fee_percentage).toBe(0.04);
    });
  });

  describe("Weight Expression (car parts)", () => {
    it("car part with weight → weight_expression pricing", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: TomameCategory.AUTOMOTIVE,
        weightLbs: 16,
      });

      expect(result.pricing_method).toBe("weight_expression");
      expect(result.pricing_group).toBe("car_parts");
      expect(result.value_fee_percentage).toBe(0.08);
      // formula: 5 + (w / 8) = 5 + 2 = 7
      expect(result.flat_rate_ghs).toBe(7);
      expect(result.weight_lbs).toBe(16);
      expect(result.flat_rate_expression).toBe("5 + (w / 8)");
      expect(result.total_ghs).toBeGreaterThan(0);
    });

    it("car part without weight → needs_review", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: TomameCategory.AUTOMOTIVE,
      });

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
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
        category: "Some Unknown Category",
      });

      expect(result.pricing_method).toBe("needs_review");
      expect(result.pricing_group).toBeNull();
      expect(result.total_ghs).toBe(0);
      expect(result.total_pesewas).toBe(0);
      expect(result.review_reason).toBeTruthy();
    });

    it("returns needs_review when no category provided", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const calc = new PricingCalculator();
      const result = await calc.calculate({
        itemPriceUsd: 200,
        quantity: 1,
      });

      expect(result.pricing_method).toBe("needs_review");
      expect(result.review_reason).toContain("determine the product category");
    });
  });

  describe("Exchange Rate", () => {
    it("throws when exchange rate is not available", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(null);

      const calc = new PricingCalculator();
      await expect(
        calc.calculate({
          itemPriceUsd: 100,
          quantity: 1,
          category: TomameCategory.CELL_PHONES,
        }),
      ).rejects.toThrow("Exchange rate for USD/GHS not available");
    });

    it("applies FX buffer to mid-market rate", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: TomameCategory.CELL_PHONES,
      });

      expect(result.mid_market_rate).toBe(15.0);
      expect(result.exchange_rate).toBeCloseTo(15.6, 1);
    });

    it("caches FX rate across multiple calculations", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      await calc.calculate({ itemPriceUsd: 100, quantity: 1, category: TomameCategory.CELL_PHONES });
      await calc.calculate({ itemPriceUsd: 200, quantity: 1, category: TomameCategory.HEADPHONES });

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
      calc.setCategoryPricing(
        buildCategoryMap([
          ["Custom Category", { slug: "custom", name: "Custom", flat_rate_ghs: 800, value_percentage: 0.06 }],
        ]),
      );

      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: "Custom Category",
      });

      expect(result.pricing_method).toBe("flat_rate");
      expect(result.pricing_group).toBe("custom");
      expect(result.flat_rate_ghs).toBe(800);
      expect(result.value_fee_percentage).toBe(0.06);
      expect(result.total_ghs).toBeGreaterThan(0);
    });

    it("unmapped category in DB map → needs_review", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
      calc.setCategoryPricing(new Map()); // empty map

      const result = await calc.calculate({
        itemPriceUsd: 100,
        quantity: 1,
        category: "Unknown",
      });

      expect(result.pricing_method).toBe("needs_review");
    });
  });

  describe("Tiered Value Percentage", () => {
    it("uses base percentage when subtotal is under threshold", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.value_fee_percentage).toBe(0.08);
      expect(result.value_fee_usd).toBeCloseTo(4.0, 2);
    });

    it("uses high percentage when subtotal exceeds threshold", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.value_fee_percentage).toBe(0.05);
      expect(result.value_fee_usd).toBeCloseTo(10.0, 2);
    });

    it("uses base percentage when no tiering configured", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.value_fee_percentage).toBe(0.06);
    });
  });

  describe("Default Weight Fallback", () => {
    it("uses default_weight_lbs when input weight is missing", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.pricing_method).toBe("weight_expression");
      // 5 + (10 / 8) = 6.25
      expect(result.flat_rate_ghs).toBe(6.25);
      expect(result.weight_lbs).toBe(10);
    });

    it("prefers input weight over default weight", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.pricing_method).toBe("weight_expression");
      // 5 + (24 / 8) = 8
      expect(result.flat_rate_ghs).toBe(8);
      expect(result.weight_lbs).toBe(24);
    });

    it("needs_review when no weight and no default", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.pricing_method).toBe("needs_review");
      expect(result.review_reason).toContain("weight");
    });
  });

  describe("Requires Weight", () => {
    it("returns needs_review with rejection reason when requires_weight and no weight", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.pricing_method).toBe("needs_review");
      expect(result.pricing_group).toBe("car_parts");
      expect(result.review_reason).toContain("requires weight");
      expect(result.review_reason).toContain("Car Parts");
      expect(result.total_ghs).toBe(0);
    });

    it("calculates normally when requires_weight and weight is provided", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const calc = new PricingCalculator();
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
      });

      expect(result.pricing_method).toBe("weight_expression");
      expect(result.flat_rate_ghs).toBe(7);
      expect(result.total_ghs).toBeGreaterThan(0);
    });
  });
});
