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

import { calculatePricing } from "../pricing.service";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("calculatePricing", () => {
  describe("Flat Rate (phones)", () => {
    it("Cell phone → flat_rate with phones pricing group", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const result = await calculatePricing({
        itemPriceUsd: 799,
        quantity: 1,
        region: "USA",
        category: TomameCategory.CELL_PHONES,
      });

      expect(result.pricing_method).toBe("flat_rate");
      expect(result.pricing_group).toBe("phones");
      expect(result.flat_rate_ghs).toBe(1200);
      expect(result.value_fee_percentage).toBe(0.05);
      expect(result.tax_percentage).toBe(0.1);
      expect(result.tax_usd).toBeCloseTo(79.9, 1);
      expect(result.value_fee_usd).toBeCloseTo(39.95, 1);
      // (799 + 79.9 + 39.95) × 15.808 + 1200
      expect(result.total_ghs).toBeGreaterThan(15000);
      expect(result.total_pesewas).toBe(Math.round(result.total_ghs * 100));
    });

    it("quantity multiplies subtotal correctly", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const result = await calculatePricing({
        itemPriceUsd: 100,
        quantity: 3,
        region: "USA",
        category: TomameCategory.CELL_PHONES,
      });

      expect(result.subtotal_usd).toBe(300);
      expect(result.tax_usd).toBeCloseTo(30, 1);
      expect(result.value_fee_usd).toBeCloseTo(15, 1); // 300 × 0.05
    });
  });

  describe("Flat Rate (phone accessories)", () => {
    it("Headphones → flat_rate with phone_accessories group", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const result = await calculatePricing({
        itemPriceUsd: 50,
        quantity: 1,
        region: "USA",
        category: TomameCategory.HEADPHONES,
      });

      expect(result.pricing_method).toBe("flat_rate");
      expect(result.pricing_group).toBe("phone_accessories");
      expect(result.flat_rate_ghs).toBe(250);
      expect(result.value_fee_percentage).toBe(0.04);
    });
  });

  describe("Weight-Based (car parts)", () => {
    it("car part with weight → weight_based pricing", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const result = await calculatePricing({
        itemPriceUsd: 200,
        quantity: 1,
        region: "USA",
        category: TomameCategory.AUTOMOTIVE,
        weightLbs: 5,
        weightSource: "scraped",
      });

      expect(result.pricing_method).toBe("weight_based");
      expect(result.pricing_group).toBe("car_parts");
      expect(result.value_fee_percentage).toBe(0.08);
      expect(result.per_weight_rate_usd).toBe(6.5);
      expect(result.weight_lbs).toBe(5);
      expect(result.freight_usd).toBeCloseTo(32.5, 1); // 5 × 6.5
      expect(result.freight_ghs).toBeGreaterThan(0);
      expect(result.total_ghs).toBeGreaterThan(0);
    });

    it("car part without weight → needs_review", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const result = await calculatePricing({
        itemPriceUsd: 200,
        quantity: 1,
        region: "USA",
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

      const result = await calculatePricing({
        itemPriceUsd: 200,
        quantity: 1,
        region: "USA",
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

      const result = await calculatePricing({
        itemPriceUsd: 200,
        quantity: 1,
        region: "USA",
      });

      expect(result.pricing_method).toBe("needs_review");
      expect(result.review_reason).toContain("could not be determined");
    });
  });

  describe("Exchange Rate", () => {
    it("throws when exchange rate is not available", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(null);

      await expect(
        calculatePricing({
          itemPriceUsd: 100,
          quantity: 1,
          region: "USA",
          category: TomameCategory.CELL_PHONES,
        }),
      ).rejects.toThrow("Exchange rate for USD/GHS not available");
    });

    it("applies FX buffer to mid-market rate", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.0);

      const result = await calculatePricing({
        itemPriceUsd: 100,
        quantity: 1,
        region: "USA",
        category: TomameCategory.CELL_PHONES,
      });

      expect(result.mid_market_rate).toBe(15.0);
      // 4% buffer: 15 × 1.04 = 15.6
      expect(result.exchange_rate).toBeCloseTo(15.6, 1);
    });
  });
});
