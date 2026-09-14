import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { PricingCalculator, type FxOverride } from "@/lib/pricing";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TomameCategory } from "@/config/categories/tomame_category";

beforeEach(() => vi.clearAllMocks());

/**
 * The constants these assertions were always written against — a 4% FX buffer,
 * 10% USA/UK tax, no tax floor. They used to be the calculator's own hardcoded
 * fallbacks; now they have to be handed in, because a calculator with no
 * constants reviews instead of pricing. The numbers are unchanged.
 */
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

/** A lock's frozen FX: the buffered pair plus every X→GHS rate at mint. */
function fx(overrides: Partial<FxOverride> = {}): FxOverride {
  return { exchange_rate: 14.49, mid_market_rate: 13.93, cross_rates: { USD: 13.93, GBP: 18.5, CNY: 1.9 }, ...overrides };
}

describe("PricingCalculator.calculate — fx override", () => {
  it("prices at the live buffered rate when fx is null", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(15.2);
    const r = await phonesCalculator().calculate({ itemPriceUsd: 100, quantity: 1, category: TomameCategory.CELL_PHONES }, null);
    expect(getGhsRate).toHaveBeenCalledWith("USD");
    expect(r.mid_market_rate).toBe(15.2);
    expect(r.exchange_rate).toBe(15.81); // 15.2 × 1.04
  });

  it("uses a lock's frozen pair verbatim and never fetches the live rate", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(99);
    const r = await phonesCalculator().calculate(
      { itemPriceUsd: 100, quantity: 1, category: TomameCategory.CELL_PHONES },
      fx(),
    );
    expect(getGhsRate).not.toHaveBeenCalled();
    expect(r.exchange_rate).toBe(14.49);
    expect(r.mid_market_rate).toBe(13.93);
    // (100 + 10 tax + 5 fee) × 14.49 + 500 flat
    expect(r.total_ghs).toBe(2166.35);
  });

  it("rounds the override the same way as a live rate", async () => {
    const r = await phonesCalculator().calculate(
      { itemPriceUsd: 100, quantity: 1, category: TomameCategory.CELL_PHONES },
      fx({ exchange_rate: 14.494999 }),
    );
    expect(r.exchange_rate).toBe(14.49);
  });

  it("converts a non-USD item through the lock's OWN cross rate, never today's table", async () => {
    // Today's GBP rate is 20 — irrelevant: the lock froze GBP→GHS at 18.5.
    vi.mocked(getGhsRate).mockImplementation(async (cur: string) => (cur === "GBP" ? 20 : null));
    const r = await phonesCalculator().calculate(
      { itemPrice: 50, itemCurrency: "GBP", quantity: 1, category: TomameCategory.CELL_PHONES, region: "uk" },
      fx({ exchange_rate: 15.6, mid_market_rate: 15, cross_rates: { USD: 15, GBP: 18.5 } }),
    );
    expect(getGhsRate).not.toHaveBeenCalled();
    expect(r.item_price_usd).toBe(61.67); // 50 × 18.5 / 15
    expect(r.item_currency).toBe("GBP");
  });

  it("throws 503 when the lock's snapshot has no rate for the item's currency — no silent fall-back to live", async () => {
    vi.mocked(getGhsRate).mockResolvedValue(20);
    await expect(
      phonesCalculator().calculate(
        { itemPrice: 50, itemCurrency: "GBP", quantity: 1, category: TomameCategory.CELL_PHONES, region: "uk" },
        fx({ cross_rates: { USD: 13.93 } }),
      ),
    ).rejects.toMatchObject({ statusCode: 503, message: expect.stringMatching(/GBP\/GHS/) });
    expect(getGhsRate).not.toHaveBeenCalled();
  });

  it("a USD item never consults the cross-rate snapshot", async () => {
    const r = await phonesCalculator().calculate(
      { itemPrice: 100, itemCurrency: "USD", quantity: 1, category: TomameCategory.CELL_PHONES },
      fx({ cross_rates: {} }),
    );
    expect(r.item_price_usd).toBe(100);
  });
});
