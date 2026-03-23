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
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PricingCalculator", () => {
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
      expect(result.review_reason).toContain("requires weight");
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
      expect(result.review_reason).toContain("could not be determined");
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
