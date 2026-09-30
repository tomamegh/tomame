import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(async (cur: string) => (cur === "USD" ? 15 : null)) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const envState = { key: "k" as string | undefined };
vi.mock("@/lib/env", () => ({ env: { extraction: { get anthropicApiKey() { return envState.key; } } } }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn() }));

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { parse };
  }
  return { default: Anthropic };
});

import { PricingCalculator } from "@/lib/pricing";
import { inspectFreight, riskSignals } from "../freight-inspector.service";
import { freightInspectionKey } from "../../freight-inspection";
import { customerExtraction, priceExtractionWith } from "@/features/extraction/quote.service";
import { withProductDefaults, type ExtractionResult, type ScrapedProduct } from "@/features/extraction/types";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import type { FixedFreightItemRow } from "@/db/queries/fixed-freight-items";
import { TomameCategory as C } from "@/config/categories/tomame_category";
import { logger } from "@/lib/logger";

const ITEMS: FixedFreightItemRow[] = [
  { id: "uuid-laptop-gaming", category: "MAC & LAPTOPS", product_name: "Laptop Gaming", freight_rate_ghs: 1500, keywords: ["gaming laptop", "omen"], sort_order: 1 },
  { id: "uuid-laptop-regular", category: "MAC & LAPTOPS", product_name: "Laptop Regular", freight_rate_ghs: 1100, keywords: ["laptop"], sort_order: 2 },
  { id: "uuid-ps5", category: "GAMING", product_name: "PS5 / PS5 Pro", freight_rate_ghs: 1500, keywords: ["ps5"], sort_order: 3 },
];

function group(o: Partial<PricingGroupRow> = {}): PricingGroupRow {
  return {
    id: "g", slug: "g", name: "G", flat_rate_ghs: 100, flat_rate_expression: null,
    value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null,
    default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0, ...o,
  };
}

function calculator(items = ITEMS): PricingCalculator {
  const calc = new PricingCalculator();
  calc.setConstants({
    freight_rate_per_lb: 5, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0,
    tax_pct_usa: 0.1, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.05,
  });
  calc.setCategoryPricing(new Map([
    [C.CLOTHING_MEN, group({ slug: "fashion_light", name: "Fashion Light", flat_rate_ghs: 70 })],
    [C.COMPUTERS, group({ slug: "computers", name: "Computers", flat_rate_ghs: null, flat_rate_expression: "weight", requires_weight: true })],
  ]));
  calc.setFixedFreightItems(items);
  return calc;
}

function extraction(product: Partial<ScrapedProduct>): ExtractionResult {
  return {
    extraction_attempted: true, extraction_success: true, platform: "amazon", country: "USA",
    product: withProductDefaults({ currency: "USD", ...product }),
    messages: [], errors: [], source: null, sources: [], confidence: {}, fetched_at: "2026-09-30T00:00:00Z",
  };
}

const verdict = (v: Record<string, unknown>) => ({
  stop_reason: "end_turn",
  parsed_output: { verdict: "correct", category: null, weight_lbs: null, weight_implausible: false, fixed_freight_item: null, confidence: 0.9, reason: "r", ...v },
});

/** An OMEN-branded hoodie with no category: the keyword alone picks Laptop Gaming. */
const HOODIE = extraction({ title: "HP OMEN Logo Hoodie, Men's Pullover Sweatshirt", price: 13.98, category: null });
const MACBOOK = extraction({ title: "Apple MacBook Pro 16-inch M1 Pro", price: 900, category: C.COMPUTERS, weight: "4", weight_lbs: null });
const url = "https://example.test/p";

beforeEach(() => {
  parse.mockReset();
  vi.mocked(logger.info).mockClear();
  envState.key = "k";
});

describe("inspectFreight", () => {
  it("corrects a hoodie priced as a gaming laptop to no fixed freight, and it prices at fashion_light flat", async () => {
    const calc = calculator();
    parse.mockResolvedValue(verdict({ category: C.CLOTHING_MEN, fixed_freight_item: "none", reason: "A hoodie is not a laptop." }));

    const inspection = await inspectFreight(HOODIE, { url, calculator: calc });

    expect(inspection?.status).toBe("corrected");
    expect(inspection?.corrections).toEqual({ category: C.CLOTHING_MEN, fixed_freight_item_id: null });
    expect(inspection?.before).toMatchObject({ pricing_method: "fixed_freight", freight_ghs: 1500, fixed_freight_item: "Laptop Gaming" });
    expect(inspection?.after).toMatchObject({ pricing_method: "flat_rate", pricing_group: "fashion_light", freight_ghs: 70, fixed_freight_item: null });
    expect(parse.mock.calls[0]?.[0]).toMatchObject({ model: "claude-haiku-4-5" });
    const prompt = parse.mock.calls[0]?.[0].messages[0].content as string;
    expect(prompt).toContain("F1 | Laptop Gaming | MAC & LAPTOPS | 1500");
    expect(prompt).not.toContain("uuid-");
    expect(logger.info).toHaveBeenCalledWith("freight inspector: corrected", expect.objectContaining({ url, store: "amazon" }));

    const priced = await priceExtractionWith(calc, { ...HOODIE, freight_inspection: inspection! }, 1, null, null);
    expect(priced.pricing).toMatchObject({ pricing_method: "flat_rate", pricing_group: "fashion_light", flat_rate_ghs: 70 });
    const uninspected = await priceExtractionWith(calc, HOODIE, 1, null, null);
    expect(uninspected.pricing).toMatchObject({ pricing_method: "fixed_freight", flat_rate_ghs: 1500 });
  });

  it("ignores a fixed-freight code that was not offered", async () => {
    parse.mockResolvedValue(verdict({ fixed_freight_item: "F99" }));
    const inspection = await inspectFreight(HOODIE, { url, calculator: calculator() });
    expect(inspection?.status).toBe("approved");
    expect(inspection?.corrections).toEqual({});
  });

  it("ignores a raw uuid too — only offered codes count", async () => {
    parse.mockResolvedValue(verdict({ fixed_freight_item: "uuid-ps5" }));
    const inspection = await inspectFreight(HOODIE, { url, calculator: calculator() });
    expect(inspection?.status).toBe("approved");
  });

  it("ignores a low-confidence correction", async () => {
    parse.mockResolvedValue(verdict({ category: C.CLOTHING_MEN, fixed_freight_item: "none", confidence: 0.4 }));
    const inspection = await inspectFreight(HOODIE, { url, calculator: calculator() });
    expect(inspection?.status).toBe("approved");
    expect(inspection?.corrections).toEqual({});
    expect(inspection?.after).toEqual(inspection?.before);
  });

  it("times out to skipped, and the product prices deterministically", async () => {
    parse.mockImplementation((_body: unknown, { signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("Request was aborted.")))));
    const calc = calculator();
    const inspection = await inspectFreight(HOODIE, { url, calculator: calc, timeoutMs: 10 });
    expect(inspection?.status).toBe("skipped");
    expect(inspection?.reason).toBe("timeout");
    const priced = await priceExtractionWith(calc, { ...HOODIE, freight_inspection: inspection! }, 1, null, null);
    expect(priced.pricing).toMatchObject({ pricing_method: "fixed_freight", flat_rate_ghs: 1500 });
  });

  it("skips without calling the model when there is no key", async () => {
    envState.key = undefined;
    const inspection = await inspectFreight(HOODIE, { url, calculator: calculator() });
    expect(inspection?.status).toBe("skipped");
    expect(parse).not.toHaveBeenCalled();
  });

  it("fails open on a model error", async () => {
    parse.mockRejectedValue(new Error("500 overloaded"));
    const inspection = await inspectFreight(HOODIE, { url, calculator: calculator() });
    expect(inspection?.status).toBe("failed");
  });

  it("returns null when there is no price to inspect", async () => {
    expect(await inspectFreight(extraction({ title: "x", price: null }), { url, calculator: calculator() })).toBeNull();
  });

  it("supplies a weight when a weight-priced product has none", async () => {
    const calc = calculator();
    parse.mockResolvedValue(verdict({ weight_lbs: 4.7, reason: "A 16-inch MacBook Pro weighs about 4.7 lb." }));
    const inspection = await inspectFreight(MACBOOK, { url, calculator: calc });
    expect(inspection?.before?.pricing_method).toBe("needs_review");
    expect(inspection?.status).toBe("corrected");
    expect(inspection?.corrections).toEqual({ weight_lbs: 4.7 });

    const priced = await priceExtractionWith(calc, { ...MACBOOK, freight_inspection: inspection! }, 1, null, null);
    expect(priced.pricing).toMatchObject({ pricing_method: "weight_expression", weight_lbs: 4.7, weight_source: "listed" });
  });

  it("keeps a listed weight unless the model calls it implausible", async () => {
    // A plausible listed weight on a weight-priced category is no risk: no model call at all.
    const listed = extraction({ ...MACBOOK.product, weight_lbs: 4 });
    parse.mockClear();
    expect((await inspectFreight(listed, { url, calculator: calculator() }))?.status).toBe("clear");
    expect(parse).not.toHaveBeenCalled();

    // Grams read as pounds trips "weight out of range", so the model is asked and may fix it.
    parse.mockResolvedValue(verdict({ weight_lbs: 0.88, weight_implausible: true, reason: "400 g, not 400 lb" }));
    const accepted = await inspectFreight(extraction({ title: "Phone case", price: 10, category: C.COMPUTERS, weight: "400", weight_lbs: 400 }), { url, calculator: calculator() });
    expect(accepted?.corrections).toEqual({ weight_lbs: 0.88 });
  });

  it("rejects out-of-range weights and a correction that would send a priced product to review", async () => {
    parse.mockResolvedValue(verdict({ weight_lbs: 5000 }));
    expect((await inspectFreight(MACBOOK, { url, calculator: calculator() }))?.status).toBe("approved");

    parse.mockResolvedValue(verdict({ category: C.COMPUTERS, fixed_freight_item: "none" }));
    const r = await inspectFreight(HOODIE, { url, calculator: calculator() });
    expect(r?.status).toBe("approved");
    expect(r?.reason).toMatch(/review/);
  });
});

describe("riskSignals", () => {
  const breakdown = (o: Record<string, unknown>) =>
    ({ pricing_method: "flat_rate", flat_rate_ghs: 70, item_price_usd: 13.98, exchange_rate: 12, ...o }) as never;
  const clothing = extraction({ title: "Hoodie", price: 13.98, category: C.CLOTHING_MEN, weight_lbs: 1.49 }).product;

  it("is empty for a category flat rate with a plausible weight", () => {
    expect(riskSignals(clothing, breakdown({}))).toEqual([]);
  });

  it("flags each risk", () => {
    expect(riskSignals(clothing, breakdown({ fixed_freight_item_id: "ff-1" }))).toContain("fixed freight matched");
    expect(riskSignals(clothing, breakdown({ pricing_method: "needs_review" }))).toContain("could not price");
    expect(riskSignals({ ...clothing, category: null }, breakdown({}))).toContain("no category");
    expect(riskSignals(clothing, breakdown({ pricing_method: "weight_expression", weight_source: "default" }))).toContain("weight not listed");
    expect(riskSignals({ ...clothing, weight_lbs: 400 }, breakdown({}))).toContain("weight out of range");
    expect(riskSignals(clothing, breakdown({ flat_rate_ghs: 1500 }))).toContain("freight dwarfs item");
  });

  it("does not flag a clearly-priced product through the inspector", async () => {
    parse.mockClear();
    const r = await inspectFreight(extraction({ title: "Hoodie", price: 13.98, category: C.CLOTHING_MEN, weight_lbs: 1.49 }), { url, calculator: calculator() });
    expect(r?.status).toBe("clear");
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("priceExtractionWith and a stored inspection", () => {
  async function corrected() {
    parse.mockResolvedValue(verdict({ category: C.CLOTHING_MEN, fixed_freight_item: "none" }));
    return (await inspectFreight(HOODIE, { url, calculator: calculator() }))!;
  }

  it("ignores a stale inspection when the product changed", async () => {
    const inspection = await corrected();
    const changed = { ...HOODIE, product: { ...HOODIE.product, price: 15.5 }, freight_inspection: inspection };
    const priced = await priceExtractionWith(calculator(), changed, 1, null, null);
    expect(priced.pricing).toMatchObject({ pricing_method: "fixed_freight", flat_rate_ghs: 1500 });
  });

  it("ignores it when the active fixed-freight table changed", async () => {
    const inspection = await corrected();
    const priced = await priceExtractionWith(calculator(ITEMS.slice(0, 2)), { ...HOODIE, freight_inspection: inspection }, 1, null, null);
    expect(priced.pricing?.pricing_method).toBe("fixed_freight");
  });

  it("applies a matching key", async () => {
    const inspection = await corrected();
    expect(inspection.input_key).toBe(freightInspectionKey(HOODIE.product, ITEMS.map((i) => i.id)));
    const priced = await priceExtractionWith(calculator(), { ...HOODIE, freight_inspection: inspection }, 2, null, null);
    expect(priced.pricing).toMatchObject({ pricing_method: "flat_rate", flat_rate_ghs: 140 });
  });

  it("never hands the inspection to a customer", async () => {
    const inspection = await corrected();
    expect("freight_inspection" in customerExtraction({ ...HOODIE, freight_inspection: inspection })).toBe(false);
  });
});
