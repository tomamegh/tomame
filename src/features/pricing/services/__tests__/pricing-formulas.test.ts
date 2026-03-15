import { describe, it, expect } from "vitest";

// ── Pure function copies for unit testing ────────────────────────────────────
// These mirror the logic in pricing.service.ts but avoid importing server-only deps.

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FX_BUFFER = 0.04;
const FREIGHT_RATE_PER_LB = 6.50;
const VOLUMETRIC_DIVISOR = 139;
const HANDLING_FEE_USD = 15.00;

function applyFxBuffer(midMarketRate: number): number {
  return roundTo2(midMarketRate * (1 + FX_BUFFER));
}

const CATEGORY_DEFAULT_WEIGHTS: Record<string, number> = {
  "Cell Phones & Accessories": 0.5,
  "Tablets / iPads": 1.5,
  "Computers": 4.5,
  "Wearable Technology": 0.4,
  "Headphones": 0.5,
  "Audio": 0.5,
  "Video Games": 8.0,
  "Gaming": 8.0,
  "Other": 0.5,
};

function getCategoryDefaultWeight(category: string | null): number {
  if (!category) return 0.5;
  return CATEGORY_DEFAULT_WEIGHTS[category] ?? 0.5;
}

interface FreightInput {
  actualWeightLbs: number | null;
  dimensions?: { lengthIn: number; widthIn: number; heightIn: number } | null;
  category: string | null;
  weightSource: "scraped" | "internet_search" | "category_default";
}

function calculateFreight(input: FreightInput) {
  let volumetricWeightLbs: number | null = null;
  if (input.dimensions) {
    const { lengthIn, widthIn, heightIn } = input.dimensions;
    volumetricWeightLbs = roundTo2((lengthIn * widthIn * heightIn) / VOLUMETRIC_DIVISOR);
  }

  let actualWeightLbs = input.actualWeightLbs;
  let weightSource = input.weightSource;
  if (actualWeightLbs == null || actualWeightLbs <= 0) {
    actualWeightLbs = getCategoryDefaultWeight(input.category);
    weightSource = "category_default";
  }

  const chargeableWeightLbs = Math.max(actualWeightLbs, volumetricWeightLbs ?? 0);
  const freightUsd = roundTo2(chargeableWeightLbs * FREIGHT_RATE_PER_LB);

  return { actualWeightLbs, volumetricWeightLbs, chargeableWeightLbs, freightUsd, weightSource };
}

function calculateServiceFee(subtotalUsd: number): { feeUsd: number; rate: number } {
  const tiers = [
    { maxUsd: 99.99, rate: 0.18, minFeeUsd: 12 },
    { maxUsd: 300, rate: 0.15, minFeeUsd: 0 },
    { maxUsd: 700, rate: 0.12, minFeeUsd: 0 },
    { maxUsd: 1500, rate: 0.10, minFeeUsd: 0 },
    { maxUsd: Infinity, rate: 0.08, minFeeUsd: 0 },
  ];
  const tier = tiers.find((t) => subtotalUsd <= t.maxUsd) ?? tiers[tiers.length - 1]!;
  const calculated = roundTo2(subtotalUsd * tier.rate);
  const feeUsd = Math.max(calculated, tier.minFeeUsd);
  return { feeUsd: roundTo2(feeUsd), rate: tier.rate };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("applyFxBuffer", () => {
  it("should apply 4% buffer to mid-market rate", () => {
    // From PDF example: 15.20 × 1.04 = 15.808
    expect(applyFxBuffer(15.20)).toBe(15.81);
  });

  it("should handle round numbers", () => {
    expect(applyFxBuffer(10)).toBe(10.4);
  });
});

describe("calculateFreight", () => {
  it("should calculate freight from actual weight only", () => {
    const result = calculateFreight({
      actualWeightLbs: 2,
      dimensions: null,
      category: null,
      weightSource: "scraped",
    });
    expect(result.chargeableWeightLbs).toBe(2);
    expect(result.freightUsd).toBe(13); // 2 × $6.50
    expect(result.weightSource).toBe("scraped");
  });

  it("should use volumetric weight when greater than actual", () => {
    // From PDF example: Bose Speaker 12×10×8 inches, 2 lbs actual
    const result = calculateFreight({
      actualWeightLbs: 2,
      dimensions: { lengthIn: 12, widthIn: 10, heightIn: 8 },
      category: null,
      weightSource: "scraped",
    });
    // Volumetric: (12×10×8) / 139 ≈ 6.91
    expect(result.volumetricWeightLbs).toBe(6.91);
    expect(result.chargeableWeightLbs).toBe(6.91);
    // Freight: 6.91 × $6.50 = $44.915 → $44.92
    expect(result.freightUsd).toBe(44.92);
  });

  it("should use actual weight when greater than volumetric", () => {
    const result = calculateFreight({
      actualWeightLbs: 10,
      dimensions: { lengthIn: 6, widthIn: 4, heightIn: 3 },
      category: null,
      weightSource: "scraped",
    });
    // Volumetric: (6×4×3) / 139 ≈ 0.52
    expect(result.volumetricWeightLbs).toBe(0.52);
    expect(result.chargeableWeightLbs).toBe(10);
    expect(result.freightUsd).toBe(65); // 10 × $6.50
  });

  it("should fall back to category default when no weight provided", () => {
    const result = calculateFreight({
      actualWeightLbs: null,
      dimensions: null,
      category: "Cell Phones & Accessories",
      weightSource: "category_default",
    });
    expect(result.chargeableWeightLbs).toBe(0.5);
    expect(result.freightUsd).toBe(3.25); // 0.5 × $6.50
    expect(result.weightSource).toBe("category_default");
  });

  it("should fall back to 0.5 lbs for unknown category", () => {
    const result = calculateFreight({
      actualWeightLbs: null,
      dimensions: null,
      category: "Unknown Category",
      weightSource: "category_default",
    });
    expect(result.chargeableWeightLbs).toBe(0.5);
    expect(result.freightUsd).toBe(3.25);
  });
});

describe("getCategoryDefaultWeight", () => {
  it("should return 0.5 for smartphones", () => {
    expect(getCategoryDefaultWeight("Cell Phones & Accessories")).toBe(0.5);
  });

  it("should return 4.5 for laptops", () => {
    expect(getCategoryDefaultWeight("Computers")).toBe(4.5);
  });

  it("should return 8.0 for gaming consoles", () => {
    expect(getCategoryDefaultWeight("Video Games")).toBe(8.0);
  });

  it("should return 0.4 for smartwatches", () => {
    expect(getCategoryDefaultWeight("Wearable Technology")).toBe(0.4);
  });

  it("should return 0.5 for null category", () => {
    expect(getCategoryDefaultWeight(null)).toBe(0.5);
  });

  it("should return 0.5 for unknown category", () => {
    expect(getCategoryDefaultWeight("Something Random")).toBe(0.5);
  });
});

describe("Method 2 full example (Bose Speaker from PDF)", () => {
  it("should match the PDF example calculation", () => {
    // PDF: Bose Speaker, $149, free shipping, 2 lbs, 12×10×8 inches
    const itemPrice = 149;
    const sellerShipping = 0;
    const freight = calculateFreight({
      actualWeightLbs: 2,
      dimensions: { lengthIn: 12, widthIn: 10, heightIn: 8 },
      category: null,
      weightSource: "scraped",
    });

    // Service fee: $149 × 15% = $22.35
    const { feeUsd: serviceFee } = calculateServiceFee(itemPrice);
    expect(serviceFee).toBe(22.35);

    // Handling: $15 flat
    const handling = HANDLING_FEE_USD;

    // Subtotal USD
    const subtotalUsd = itemPrice + sellerShipping + freight.freightUsd + serviceFee + handling;
    // PDF says $231.20 (uses 6.9 lbs volumetric), we get 6.91 → slight diff
    expect(subtotalUsd).toBeCloseTo(231.27, 1);

    // Applied FX: 15.20 × 1.04 = 15.808 → 15.81
    const appliedFx = applyFxBuffer(15.20);
    expect(appliedFx).toBe(15.81);

    // Customer pays: subtotal × applied FX ≈ GH₵ 3,656
    const totalGhs = subtotalUsd * appliedFx;
    expect(totalGhs).toBeCloseTo(3656, -1); // Within GH₵10 of PDF's GH₵3,655
  });
});

describe("Method 1 example (iPhone 16 from PDF)", () => {
  it("should match the PDF example calculation", () => {
    // PDF: iPhone 16, $799, mid-market rate 15.20
    const itemPriceUsd = 799;
    const appliedFx = applyFxBuffer(15.20); // 15.81
    const itemPriceGhs = roundTo2(itemPriceUsd * appliedFx);
    // PDF: $799 × 15.808 = GH₵ 12,630
    expect(itemPriceGhs).toBeCloseTo(12630, -1);

    const fixedFreightGhs = 1400;
    const totalGhs = roundTo2(itemPriceGhs + fixedFreightGhs);
    // PDF: GH₵ 14,030
    expect(totalGhs).toBeCloseTo(14030, -1);
  });
});
