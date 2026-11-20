import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(), getAllRates: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ calculatePricing: vi.fn() }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn() }));

import { PricingCalculator, type PricingBreakdown } from "@/lib/pricing";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { buildWorkedExample, DEFAULT_WORKED_EXAMPLE_INPUT } from "@/features/marketing/services/worked-example.service";
import { buildReceiptRows } from "@/features/app-home/components/format";
import { paidRows } from "@/features/journeys/format";
import { breakdownRows } from "@/lib/email/templates/order-status";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import {
  CUSTOMS_LINE,
  CUSTOMS_ROW_LABEL,
  CUSTOMS_ROW_VALUE,
  FEE_FAQ,
  CUSTOMS_FAQ,
  feeRowLabel,
  feeSentence,
} from "../price-story";

/**
 * B6 acceptance checks (trust & polish, 2026-11-20).
 *
 * Prod's pricing on 2026-11-20: $6/lb, $3 handling per line, 1 lb minimum,
 * every group and `default_value_fee_pct` at 4%, US tax 10% with a $2 floor,
 * and the buffered rate at GH₵12.25. Headphones price by weight.
 */
const PROD_CONSTANTS = {
  freight_rate_per_lb: 6,
  handling_fee_usd: 3,
  minimum_tax_usd: 2,
  fx_buffer_pct: 0.04,
  tax_pct_usa: 0.1,
  tax_pct_uk: 0.1,
  tax_pct_china: 0.08,
  minimum_chargeable_weight_lbs: 1,
  default_value_fee_pct: 0.04,
};

const SOUND_GROUP: PricingGroupRow = {
  id: "g-sound",
  slug: "sound_speakers",
  name: "Sound & Speakers",
  flat_rate_ghs: null,
  flat_rate_expression: "w",
  value_percentage: 0.04,
  value_percentage_high: null,
  value_threshold_usd: null,
  default_weight_lbs: null,
  requires_weight: false,
  is_active: true,
  sort_order: 1,
};

/** $1 = GH₵12.25, held like a quote lock so no rate is read. */
const FX_12_25 = { exchange_rate: 12.25, mid_market_rate: 11.78, cross_rates: { USD: 11.78 } };

async function priceHero(weightLbs: number): Promise<PricingBreakdown> {
  const calculator = new PricingCalculator();
  calculator.setConstants(PROD_CONSTANTS);
  calculator.setCategoryPricing(new Map([["Headphones", SOUND_GROUP]]));
  return calculator.calculate(
    { itemPriceUsd: 49.99, quantity: 1, category: "Headphones", weightLbs, region: "usa", fixedFreightItemId: null },
    FX_12_25,
  );
}

/**
 * THE BRIEF SAYS GH₵801.03; THE ENGINE SAYS GH₵808.38. Not fudged: with the
 * constants above, a sub-1 lb headphone hits the 1 lb minimum, so freight is
 * (1 × $6 + $3) × 12.25 = GH₵110.25 and the total is $56.99 × 12.25 + 110.25.
 * 801.03 needs freight of GH₵102.90 ($8.40) — 0.9 lb × $6 + $3 with no 1 lb
 * floor — which these constants cannot produce for a weight-priced item.
 */
describe("hero example: Oraimo BoomPop N, $49.99 at $1 = GH₵12.25", () => {
  it("totals GH₵808.38 on prod's stated constants (the brief's 801.03 is not reproducible)", async () => {
    const breakdown = await priceHero(0.6);
    expect(breakdown.tax_usd).toBe(5);
    expect(breakdown.value_fee_usd).toBe(2);
    expect(breakdown.weight_source).toBe("minimum");
    expect(breakdown.flat_rate_ghs).toBe(110.25);
    expect(breakdown.total_ghs).toBe(808.38);
    expect(breakdown.total_ghs).not.toBe(801.03);
  });

  it("is the same at 0.9 lb: anything under 1 lb is charged as 1 lb", async () => {
    expect((await priceHero(0.9)).total_ghs).toBe(808.38);
  });

  it("renders the 1 lb freight as GH₵110.25 ($9) and prints customs at zero without moving the total", async () => {
    const breakdown = await priceHero(0.6);
    const example = buildWorkedExample(
      { ...DEFAULT_WORKED_EXAMPLE_INPUT, item_price_usd: 49.99, weight_lbs: 0.6, price_presets_usd: [49.99] },
      breakdown,
    );
    expect(example.total_ghs_display).toBe("GH₵808.38");
    expect(example.rows.find((r) => r.key === "freight")?.value).toContain("GH₵110.25");
    const byKey = Object.fromEntries(example.rows.map((row) => [row.key, row]));
    expect(byKey.fee?.label).toBe("Tomame fee – 4% flat");
    expect(byKey.freight?.label).toContain("Freight, incl. customs & clearance");
    expect(byKey.customs).toMatchObject({ label: CUSTOMS_ROW_LABEL, value: CUSTOMS_ROW_VALUE, bar_pct: 0 });
  });
});

// ── Every breakdown, one story ───────────────────────────────────────────────

const ORDER_PRICING = {
  pricing_method: "weight_expression",
  pricing_group: "sound_speakers",
  item_price: 49.99,
  item_currency: "USD",
  item_price_usd: 49.99,
  quantity: 1,
  subtotal_usd: 49.99,
  exchange_rate: 12.25,
  mid_market_rate: 11.78,
  tax_percentage: 0.1,
  tax_usd: 5,
  value_fee_percentage: 0.04,
  value_fee_usd: 2,
  flat_rate_ghs: 102.9,
  total_ghs: 801.03,
  total_pesewas: 80103,
  fee_calculation_note: "",
} as unknown as PricingBreakdown & OrderPricingBreakdown;

/** Every customer breakdown builder, flattened to "label | value" lines. */
function everyBreakdown(): Record<string, string[]> {
  const example = buildWorkedExample(DEFAULT_WORKED_EXAMPLE_INPUT, ORDER_PRICING);
  return {
    hero_and_fees: example.rows.map((r) => `${r.key}|${r.label}|${r.value}`),
    quote_and_home: buildReceiptRows(ORDER_PRICING).map((r) => `${r.key}|${r.label}|${r.value}`),
    receipt_page: paidRows(ORDER_PRICING).map((r) => `${r.key}|${r.label}|${r.value}`),
    email: breakdownRows({
      itemPriceUsd: 49.99,
      subtotalUsd: 49.99,
      taxPercentage: 0.1,
      taxUsd: 5,
      valueFeePercentage: 0.04,
      valueFeeUsd: 2,
      flatRateGhs: 102.9,
      exchangeRate: 12.25,
      totalGhs: 801.03,
    })
      .filter((r): r is readonly [string, string] => Array.isArray(r))
      .map(([label, value]) => `${label.includes("Freight") ? "freight" : ""}|${label}|${value}`),
  };
}

describe("one price story in every breakdown", () => {
  it("never prints a freight amount without 'incl. customs & clearance'", () => {
    for (const [surface, lines] of Object.entries(everyBreakdown())) {
      const freight = lines.filter((l) => /freight/i.test(l.split("|")[1] ?? "") && /GH₵\d/.test(l));
      expect(freight.length, surface).toBeGreaterThan(0);
      for (const line of freight) {
        if (line.includes(CUSTOMS_ROW_LABEL.replace(/&/g, "&amp;")) || line.includes(CUSTOMS_ROW_LABEL)) continue;
        expect(line.replace(/&amp;/g, "&"), surface).toContain("incl. customs & clearance");
      }
    }
  });

  it("prints the customs line, at GH₵0 extra, in every breakdown", () => {
    for (const [surface, lines] of Object.entries(everyBreakdown())) {
      const text = lines.join("\n").replace(/&amp;/g, "&");
      expect(text, surface).toContain(`${CUSTOMS_ROW_LABEL}|${CUSTOMS_ROW_VALUE}`);
    }
    expect(CUSTOMS_LINE).toBe("Customs & clearance – Included in freight – GH₵0 extra");
  });

  it("labels the fee from the engine's percentage, as 'Tomame fee – 4% flat'", () => {
    for (const [surface, lines] of Object.entries(everyBreakdown())) {
      expect(lines.join("\n"), surface).toContain("Tomame fee – 4% flat");
    }
    expect(feeRowLabel(0.04)).toBe("Tomame fee – 4% flat");
    expect(feeSentence(0.04)).toBe("Tomame fee – 4% flat on the item price. No category tiers.");
  });

  it("keeps the two FAQ answers word for word", () => {
    expect(CUSTOMS_FAQ.answer).toBe(
      "No. Customs duty and clearance are included in the freight price you see before you pay. What you see is what you pay - no extra charge on delivery in Greater Accra.",
    );
    expect(FEE_FAQ.answer).toBe(
      "4% flat on the item price. The same 4% applies to every category - there are no category tiers and no higher rate.",
    );
  });
});

// ── No stale fee wording in customer-facing source ───────────────────────────

const SRC = join(__dirname, "..", "..");
const CUSTOMER_FACING = [
  "app/(marketing)",
  "components/marketing",
  "components/layout/marketing",
  "config/price-story.ts",
  "config/tracking-copy.ts",
  "features/marketing",
  "features/app-home/components",
  "features/bag/components",
  "features/journeys",
  "features/quotes/components",
  "features/tracking",
  "lib/email/templates",
  "lib/whatsapp",
];

function sourceFiles(path: string): string[] {
  const full = join(SRC, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => {
    if (name === "__tests__" || name.includes(".test.")) return [];
    const child = join(path, name);
    return statSync(join(SRC, child)).isDirectory() ? sourceFiles(child) : /\.(ts|tsx)$/.test(name) ? [join(SRC, child)] : [];
  });
}

/** Code with its comments removed, so a comment recording an old figure is not a hit. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("no customer-facing fee tiers", () => {
  it("has no '5%' fee and no '3%–8%' / '4%–8%' range in customer-facing strings", () => {
    const hits: string[] = [];
    for (const file of CUSTOMER_FACING.flatMap(sourceFiles)) {
      const code = withoutComments(readFileSync(file, "utf8"));
      for (const match of code.matchAll(/[^\n]*(?:\b[345]%\s*[–-]\s*8%|[Ff]ee[^\n"'`]{0,40}\b5%|\b5%[^\n"'`]{0,20}[Ff]ee)[^\n]*/g)) {
        hits.push(`${file.slice(SRC.length)}: ${match[0].trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
