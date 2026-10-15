import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(async (cur: string) => (cur === "USD" ? 12 : null)) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const envState = { key: "k" as string | null };
vi.mock("@/lib/env", () => ({ env: { extraction: { get anthropicApiKey() { return envState.key; }, openRouterApiKey: null } } }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn() }));
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic { messages = { parse }; }
  return { default: Anthropic };
});
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: () => ({}) }));

import { PricingCalculator, estimateWeightLbs, screenDiagonalInches } from "@/lib/pricing";
import { inspectFreight } from "../freight-inspector.service";
import { customerMessages, priceExtractionWith } from "@/features/extraction/quote.service";
import { WEIGHT_NOT_LISTED_MESSAGE } from "@/features/extraction/resolvers/messages";
import { withProductDefaults, type ExtractionResult, type ScrapedProduct } from "@/features/extraction/types";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { TomameCategory as C } from "@/config/categories/tomame_category";
import type { PricingBreakdown } from "@/lib/pricing";

function group(o: Partial<PricingGroupRow> = {}): PricingGroupRow {
  return {
    id: "g", slug: "g", name: "G", flat_rate_ghs: 100, flat_rate_expression: null,
    value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null,
    default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0, ...o,
  };
}

function calculator(): PricingCalculator {
  const calc = new PricingCalculator();
  calc.setConstants({
    freight_rate_per_lb: 6, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0,
    tax_pct_usa: 0.088, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.08,
  });
  calc.setCategoryPricing(new Map([
    [C.TV_VIDEO, group({ slug: "tv", name: "TV & Video", flat_rate_ghs: null, flat_rate_expression: "weight", default_weight_lbs: 15 })],
    [C.CLOTHING_MEN, group({ slug: "fashion_light", name: "Fashion Light", flat_rate_ghs: 70 })],
  ]));
  calc.setFixedFreightItems([]);
  return calc;
}

function extraction(product: Partial<ScrapedProduct>, platform = "generic"): ExtractionResult {
  return {
    extraction_attempted: true, extraction_success: true, platform, country: "USA",
    product: withProductDefaults({ currency: "USD", ...product }),
    messages: [WEIGHT_NOT_LISTED_MESSAGE], errors: [], source: null, sources: [], confidence: {}, fetched_at: "2026-10-12T00:00:00Z",
  };
}

const SAMSUNG = extraction({ title: "SAMSUNG 65” Class M70H Series Mini LED 4K UHD Vision AI Companion Smart Tizen TV", price: 470.79, category: C.TV_VIDEO });
const LG = extraction({ title: 'LG 85" NU710B Series 4K UHD AI Smart TV', price: 824.99, category: C.TV_VIDEO });
const NO_SIZE = extraction({ title: "Samsung Frame TV The Terrace Outdoor Edition", price: 999, category: C.TV_VIDEO });
const url = "https://example.test/p";

beforeEach(() => {
  parse.mockReset();
  envState.key = "k";
});

describe("screenDiagonalInches / estimateWeightLbs", () => {
  it("reads the diagonal however the store writes it", () => {
    expect(screenDiagonalInches('LG 85" NU710B Series')).toBe(85);
    expect(screenDiagonalInches("SAMSUNG 65” Class M70H")).toBe(65);
    expect(screenDiagonalInches("Samsung 55-Inch Class M70H")).toBe(55);
    expect(screenDiagonalInches("Hisense 43 inch A6 series")).toBe(43);
    expect(screenDiagonalInches("TCL 75in QM8")).toBe(75);
    expect(screenDiagonalInches("Sony 32'' Bravia")).toBe(32);
  });

  it("ignores numbers that are not a screen size", () => {
    expect(screenDiagonalInches("4K UHD AI Smart TV 2026 model")).toBeNull();
    expect(screenDiagonalInches('12" laptop sleeve')).toBeNull();
    expect(screenDiagonalInches("120 Hz 4K TV")).toBeNull();
    expect(screenDiagonalInches(null)).toBeNull();
  });

  it("estimates boxed weight from the diagonal for TVs only", () => {
    expect(estimateWeightLbs({ title: SAMSUNG.product.title, category: C.TV_VIDEO })).toEqual({ lbs: 67.6, basis: "65-inch screen" });
    expect(estimateWeightLbs({ title: LG.product.title, category: C.TV_VIDEO })).toEqual({ lbs: 115.6, basis: "85-inch screen" });
    expect(estimateWeightLbs({ title: '27" monitor', category: C.COMPUTERS })).toBeNull();
    expect(estimateWeightLbs({ title: NO_SIZE.product.title, category: C.TV_VIDEO })).toBeNull();
  });
});

describe("pricing a TV with no listed weight", () => {
  it("charges the size estimate and labels it, instead of the 15 lb placeholder", async () => {
    const priced = await priceExtractionWith(calculator(), SAMSUNG, 1, null, null);
    expect(priced.pricing).toMatchObject({ pricing_method: "weight_expression", weight_lbs: 67.6, weight_source: "estimated" });
    expect(priced.pricing?.fee_calculation_note).toContain("67.6 lb (estimated)");
  });

  it("keeps the category placeholder, named as such, when the title has no size", async () => {
    const priced = await priceExtractionWith(calculator(), NO_SIZE, 1, null, null);
    expect(priced.pricing).toMatchObject({ weight_lbs: 15, weight_source: "default" });
    expect(priced.pricing?.fee_calculation_note).toContain("15 lb (typical for the category)");
  });

  it("a listed weight is never relabelled", async () => {
    const priced = await priceExtractionWith(calculator(), extraction({ ...SAMSUNG.product, weight: "52 lbs", weight_lbs: 52 }), 1, null, null);
    expect(priced.pricing).toMatchObject({ weight_lbs: 52, weight_source: "listed" });
    expect(priced.pricing?.fee_calculation_note).toMatch(/^52 lb ×/);
  });

  it("the inspector sees the estimate as an estimate, and its own weight is labelled estimated too", async () => {
    const calc = calculator();
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { verdict: "correct", category: "keep", weight_lbs: 100, weight_implausible: false, fixed_freight_item: "keep", basis: "estimated", sources: [], confidence: 0.9, reason: "An 85-inch TV ships at about 100 lb." },
    });
    const inspection = await inspectFreight(LG, { url, calculator: calc });
    const prompt = parse.mock.calls[0]?.[0].messages[0].content as string;
    expect(prompt).toContain("weight used: 115.6 lb");
    expect(prompt).toContain("weight source: estimated from the product's size in the title");
    expect(inspection?.status).toBe("corrected");
    expect(inspection?.corrections).toEqual({ weight_lbs: 100 });

    const priced = await priceExtractionWith(calc, { ...LG, freight_inspection: inspection! }, 1, null, null);
    expect(priced.pricing).toMatchObject({ weight_lbs: 100, weight_source: "estimated" });
    expect(priced.pricing?.fee_calculation_note).toContain("100 lb (estimated)");
  });

  it("tells the inspector a placeholder is not evidence", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { verdict: "ok", category: "keep", weight_lbs: 0, weight_implausible: false, fixed_freight_item: "keep", basis: "not_applicable", sources: [], confidence: 0.9, reason: "fine" } });
    await inspectFreight(NO_SIZE, { url, calculator: calculator() });
    const call = parse.mock.calls[0]?.[0];
    expect(call.messages[0].content).toContain("weight source: the category's placeholder weight (no weight listed; not evidence)");
    expect(call.system).toContain("A placeholder is NOT evidence");
  });
});

describe("customerMessages", () => {
  const weightPricing = (o: Partial<PricingBreakdown>) => ({ pricing_method: "weight_expression", ...o }) as PricingBreakdown;

  it("replaces the chain's warning with the estimate and the hub promise", () => {
    expect(customerMessages([WEIGHT_NOT_LISTED_MESSAGE], weightPricing({ weight_source: "estimated", weight_lbs: 67.6 })))
      .toEqual(["Weight estimated at 67.6 lb from the product details. We confirm it on the scale when your item reaches our hub."]);
  });

  it("keeps the warning for a placeholder, drops it for a listed weight or a flat rate, keeps it when nothing priced", () => {
    expect(customerMessages(["other", WEIGHT_NOT_LISTED_MESSAGE], weightPricing({ weight_source: "default", weight_lbs: 15 }))).toEqual(["other", WEIGHT_NOT_LISTED_MESSAGE]);
    expect(customerMessages([WEIGHT_NOT_LISTED_MESSAGE], weightPricing({ weight_source: "listed", weight_lbs: 52 }))).toEqual([]);
    expect(customerMessages([WEIGHT_NOT_LISTED_MESSAGE], { pricing_method: "flat_rate" } as PricingBreakdown)).toEqual([]);
    expect(customerMessages([WEIGHT_NOT_LISTED_MESSAGE, "other"], null)).toEqual(["other", WEIGHT_NOT_LISTED_MESSAGE]);
    expect(customerMessages(["other"], weightPricing({ weight_source: "default" }))).toEqual(["other", WEIGHT_NOT_LISTED_MESSAGE]);
  });
});
