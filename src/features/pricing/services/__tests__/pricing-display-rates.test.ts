import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { PricingCalculator } from "@/lib/pricing";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";

beforeEach(() => vi.clearAllMocks());

const RATES: Record<string, number> = { USD: 15.2, GBP: 19.4 };

function constants() {
  return {
    freight_rate_per_lb: 5, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0.04,
    tax_pct_usa: 0.1, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 0, default_value_fee_pct: 0.05,
  };
}

function phonesCalculator(): PricingCalculator {
  const calc = new PricingCalculator();
  calc.setConstants(constants());
  const group: PricingGroupRow = {
    id: "g1", slug: "phones", name: "Phones", flat_rate_ghs: 500, flat_rate_expression: null,
    value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null,
    default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0,
  };
  calc.setCategoryPricing(new Map([[TomameCategory.CELL_PHONES, group]]));
  return calc;
}

/**
 * The shop's display calculator is handed a rate table from a shared read
 * (`useGhsRates`); the quote and checkout calculators fetch live
 * (`loadFxRate`). Same rates in, the same total must come out, or a card
 * would show a figure the bag does not charge.
 */
describe("PricingCalculator.useGhsRates", () => {
  const inputs = [
    { itemPriceUsd: 100, quantity: 1, category: TomameCategory.CELL_PHONES },
    { itemPrice: 50, itemCurrency: "GBP", quantity: 2, category: TomameCategory.CELL_PHONES, region: "uk" as const },
  ];

  it.each(inputs)("strikes the same total as a calculator that fetches live (%o)", async (input) => {
    vi.mocked(getGhsRate).mockImplementation(async (cur: string) => RATES[cur] ?? null);
    const live = await phonesCalculator().calculate(input, null);

    vi.mocked(getGhsRate).mockClear();
    const display = phonesCalculator();
    display.useGhsRates(RATES);
    const shown = await display.calculate(input, null);

    expect(getGhsRate).not.toHaveBeenCalled();
    expect(shown.total_ghs).toBe(live.total_ghs);
    expect(shown.exchange_rate).toBe(live.exchange_rate);
    expect(shown.exchange_rate).toBe(15.81); // 15.2 × 1.04, rounded like loadFxRate
  });

  it("fetches a currency the table lacks, as the live path would", async () => {
    vi.mocked(getGhsRate).mockImplementation(async (cur: string) => (cur === "CNY" ? 2.1 : null));
    const display = phonesCalculator();
    display.useGhsRates({ USD: 15.2 });
    await display.calculate({ itemPrice: 100, itemCurrency: "CNY", quantity: 1, category: TomameCategory.CELL_PHONES, region: "china" }, null);
    expect(getGhsRate).toHaveBeenCalledWith("CNY");
    expect(getGhsRate).not.toHaveBeenCalledWith("USD");
  });

  it("does not price a calculator with no constants, rates or not", async () => {
    const bare = new PricingCalculator();
    bare.useGhsRates(RATES);
    const r = await bare.calculate({ itemPriceUsd: 100, quantity: 1, category: TomameCategory.CELL_PHONES }, null);
    expect(r.pricing_method).toBe("needs_review");
  });
});
