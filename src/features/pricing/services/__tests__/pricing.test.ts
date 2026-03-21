import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FixedFreightItem } from "@/features/pricing/types";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock supabase admin
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockSupabaseClient,
}));

// Mock exchange rate service
vi.mock("@/lib/exchange-rates/service", () => ({
  getGhsRate: vi.fn(),
}));

// Mock serpapi weight lookup
vi.mock("@/lib/serpapi/weight-lookup", () => ({
  lookupProductWeight: vi.fn(),
}));

// Mock audit service
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { calculatePricing } from "../pricing.service";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { lookupProductWeight } from "@/lib/serpapi/weight-lookup";

// Fixtures
const IPHONE_16: FixedFreightItem = {
  id: "ff-iphone16",
  category: "IPHONE",
  product_name: "iPhone 16",
  freight_rate_ghs: 1400,
  keywords: ["iphone 16"],
  sort_order: 5,
  is_active: true,
  created_at: "",
  updated_at: "",
};

const IPHONE_16_PRO: FixedFreightItem = {
  id: "ff-iphone16pro",
  category: "IPHONE",
  product_name: "iPhone 16 Pro & Max",
  freight_rate_ghs: 1600,
  keywords: ["iphone 16 pro", "iphone 16 pro max", "iphone 16 max"],
  sort_order: 4,
  is_active: true,
  created_at: "",
  updated_at: "",
};

// Default pricing constants from DB
const DEFAULT_PRICING_CONSTANTS = [
  { key: "freight_rate_per_lb", value: 6.5 },
  { key: "handling_fee_usd", value: 15 },
  { key: "fx_buffer_pct", value: 0.04 },
  { key: "volumetric_divisor", value: 139 },
  { key: "minimum_tax_usd", value: 12 },
];

// Default region pricing config (10% tax for USA)
const USA_PRICING_CONFIG = {
  id: "pc-usa",
  region: "USA",
  base_shipping_fee_usd: 15,
  exchange_rate: 14.5,
  service_fee_percentage: 0.10,
  last_updated: new Date().toISOString(),
  updated_by: null,
};

// Mock Supabase client
let mockFixedFreightItems: FixedFreightItem[] = [];
let mockPricingConstants = DEFAULT_PRICING_CONSTANTS;
let mockPricingConfig: typeof USA_PRICING_CONFIG | null = USA_PRICING_CONFIG;

const mockSupabaseClient = {
  from: (table: string) => {
    if (table === "fixed_freight_items") {
      return {
        select: () => ({
          eq: (_col: string, _val: unknown) => ({
            order: () =>
              Promise.resolve({
                data: mockFixedFreightItems,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "pricing_constants") {
      return {
        select: () =>
          Promise.resolve({
            data: mockPricingConstants,
            error: null,
          }),
      };
    }
    if (table === "pricing_config") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: mockPricingConfig,
                error: mockPricingConfig ? null : { message: "not found" },
              }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: null, error: { message: "not found" } }),
        }),
      }),
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFixedFreightItems = [IPHONE_16, IPHONE_16_PRO];
  mockPricingConstants = DEFAULT_PRICING_CONSTANTS;
  mockPricingConfig = USA_PRICING_CONFIG;
});

describe("calculatePricing", () => {
  describe("Method 1: Fixed Freight", () => {
    it("iPhone 16 @ $799 with mid-market 15.20 → ~GH₵ 14,030", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const result = await calculatePricing({
        itemPriceUsd: 799,
        quantity: 1,
        region: "USA",
        productName: "Apple iPhone 16 128GB",
      });

      expect(result.pricing_method).toBe("fixed_freight");
      expect(result.fixed_freight_ghs).toBe(1400);
      expect(result.fixed_freight_item_id).toBe("ff-iphone16");
      expect(result.exchange_rate).toBeCloseTo(15.808, 2);
      expect(result.mid_market_rate).toBe(15.2);

      // Item price in GHS: 799 × 15.808 = 12,630.59
      // + freight 1400 = 14,030.59
      expect(result.total_ghs).toBeCloseTo(14030, -1);
    });

    it("iPhone 16 Pro Max matches the more specific keyword", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);

      const result = await calculatePricing({
        itemPriceUsd: 1199,
        quantity: 1,
        region: "USA",
        productName: "Apple iPhone 16 Pro Max 256GB",
      });

      expect(result.pricing_method).toBe("fixed_freight");
      expect(result.fixed_freight_ghs).toBe(1600);
      expect(result.fixed_freight_item_id).toBe("ff-iphone16pro");
    });
  });

  describe("Method 2: Formula-Based", () => {
    it("Bose Speaker @ $149, 2lbs, 12×10×8″ — uses region tax %", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);
      mockFixedFreightItems = []; // No fixed freight matches
      // Region tax = 10%
      mockPricingConfig = { ...USA_PRICING_CONFIG, service_fee_percentage: 0.15 };

      const result = await calculatePricing({
        itemPriceUsd: 149,
        quantity: 1,
        region: "USA",
        productName: "Bose Speaker Something",
        sellerShippingUsd: 0,
        weightLbs: 2,
        weightSource: "scraped",
        dimensionsInches: { length: 12, width: 10, height: 8 },
      });

      expect(result.pricing_method).toBe("formula");

      // Volumetric: (12×10×8) / 139 = 6.9
      expect(result.volumetric_weight_lbs).toBeCloseTo(6.91, 1);

      // Chargeable: max(2, 6.9) = 6.9
      expect(result.chargeable_weight_lbs).toBeCloseTo(6.91, 1);

      // Freight: 6.9 × $6.50 = $44.85
      expect(result.freight_usd).toBeCloseTo(44.89, 0);

      // Tax: $149 × 15% (from region config) = $22.35
      expect(result.service_fee_percentage).toBe(0.15);
      expect(result.service_fee_usd).toBeCloseTo(22.35, 1);

      // Handling: $15
      expect(result.handling_fee_usd).toBe(15);

      // Total USD: 149 + 0 + 44.89 + 22.35 + 15 ≈ 231.24
      expect(result.total_usd).toBeCloseTo(231.24, 0);

      // Total GHS: 231.24 × 15.808 ≈ 3,656
      expect(result.total_ghs).toBeCloseTo(3655, -1);
    });

    it("applies minimum tax from pricing_constants for cheap items", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);
      mockFixedFreightItems = [];
      // Region tax = 10%, minimum_tax = $12
      mockPricingConfig = { ...USA_PRICING_CONFIG, service_fee_percentage: 0.10 };

      const result = await calculatePricing({
        itemPriceUsd: 50,
        quantity: 1,
        region: "USA",
        weightLbs: 1,
        weightSource: "scraped",
      });

      // 50 × 10% = $5, but minimum is $12
      expect(result.service_fee_usd).toBe(12);
      expect(result.service_fee_percentage).toBe(0.10);
    });

    it("uses admin-editable minimum tax from DB", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);
      mockFixedFreightItems = [];
      mockPricingConfig = { ...USA_PRICING_CONFIG, service_fee_percentage: 0.10 };
      // Admin changed minimum tax to $8
      mockPricingConstants = DEFAULT_PRICING_CONSTANTS.map((c) =>
        c.key === "minimum_tax_usd" ? { ...c, value: 8 } : c,
      );

      const result = await calculatePricing({
        itemPriceUsd: 50,
        quantity: 1,
        region: "USA",
        weightLbs: 1,
        weightSource: "scraped",
      });

      // 50 × 10% = $5, but new minimum is $8
      expect(result.service_fee_usd).toBe(8);
    });

    it("falls back to tiered tax when region config has 0% tax", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);
      mockFixedFreightItems = [];
      // Region tax is 0 — should fall back to tiers
      mockPricingConfig = { ...USA_PRICING_CONFIG, service_fee_percentage: 0 };

      const result = await calculatePricing({
        itemPriceUsd: 149,
        quantity: 1,
        region: "USA",
        weightLbs: 2,
        weightSource: "scraped",
      });

      // Falls back to tier: $100-300 = 15%
      expect(result.service_fee_percentage).toBe(0.15);
      expect(result.service_fee_usd).toBeCloseTo(22.35, 1);
    });

    it("uses SerpAPI weight when scraped weight unavailable", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);
      vi.mocked(lookupProductWeight).mockResolvedValue({
        weightLbs: 3.5,
        source: "serpapi:https://example.com",
      });
      mockFixedFreightItems = [];

      const result = await calculatePricing({
        itemPriceUsd: 200,
        quantity: 1,
        region: "USA",
        productName: "Some Unknown Product",
      });

      expect(result.weight_lbs).toBe(3.5);
      expect(result.weight_source).toBe("internet_search");
      expect(lookupProductWeight).toHaveBeenCalledWith("Some Unknown Product");
    });

    it("falls back to category default when SerpAPI returns nothing", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);
      vi.mocked(lookupProductWeight).mockResolvedValue(null);
      mockFixedFreightItems = [];

      const result = await calculatePricing({
        itemPriceUsd: 200,
        quantity: 1,
        region: "USA",
        productName: "Some Unknown Phone",
        category: "Cell Phones & Accessories",
      });

      expect(result.weight_lbs).toBe(0.5);
      expect(result.weight_source).toBe("category_default");
    });

    it("uses fallback FX rate when exchange_rates table empty", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(null);
      mockFixedFreightItems = [];

      const result = await calculatePricing({
        itemPriceUsd: 100,
        quantity: 1,
        region: "USA",
        weightLbs: 1,
        weightSource: "scraped",
      });

      // Fallback: 14.50 × 1.04 = 15.08
      expect(result.mid_market_rate).toBe(14.5);
      expect(result.exchange_rate).toBeCloseTo(15.08, 2);
    });

    it("uses admin-editable freight rate and handling fee from DB", async () => {
      vi.mocked(getGhsRate).mockResolvedValue(15.2);
      mockFixedFreightItems = [];
      // Admin changed freight to $8/lb and handling to $20
      mockPricingConstants = DEFAULT_PRICING_CONSTANTS.map((c) => {
        if (c.key === "freight_rate_per_lb") return { ...c, value: 8 };
        if (c.key === "handling_fee_usd") return { ...c, value: 20 };
        return c;
      });

      const result = await calculatePricing({
        itemPriceUsd: 100,
        quantity: 1,
        region: "USA",
        weightLbs: 2,
        weightSource: "scraped",
      });

      // Freight: 2 × $8 = $16
      expect(result.freight_usd).toBe(16);
      // Handling: $20
      expect(result.handling_fee_usd).toBe(20);
    });
  });
});
