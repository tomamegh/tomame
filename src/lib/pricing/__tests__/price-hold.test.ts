import { describe, expect, it } from "vitest";
import { applyPriceHold, heldUnitFor, withoutPriceHold } from "../price-hold";
import type { PricingBreakdown } from "../calculator";

const NOW = new Date("2026-11-23T12:00:00Z");
const LATER = "2026-11-24T09:00:00Z";
const EARLIER = "2026-11-23T11:00:00Z";

function priced(total: number, overrides: Partial<PricingBreakdown> = {}): PricingBreakdown {
  return {
    pricing_method: "flat_rate",
    pricing_group: "electronics",
    item_price: 179.99,
    item_currency: "USD",
    item_price_usd: 179.99,
    quantity: 1,
    subtotal_usd: 179.99,
    exchange_rate: 12.28,
    mid_market_rate: 11.9,
    tax_percentage: 6.25,
    tax_usd: 11.25,
    value_fee_percentage: 0.04,
    value_fee_usd: 7.2,
    flat_rate_ghs: 250,
    total_ghs: total,
    total_pesewas: Math.round(total * 100),
    total_usd: Math.round((total / 12.28) * 100) / 100,
    fee_calculation_note: "",
    ...overrides,
  };
}

describe("applyPriceHold (cap GH₵50)", () => {
  const hold = { heldUnitGhs: 2693.21, expiresAt: LATER };

  it("absorbs a rise inside the cap: the customer pays exactly what was quoted", () => {
    const out = applyPriceHold(priced(2734.21), hold, 50, NOW);
    expect(out.total_ghs).toBe(2693.21);
    expect(out.total_pesewas).toBe(269321);
    expect(out.price_hold_ghs).toBe(41);
    expect(out.held_total_ghs).toBe(2693.21);
  });

  it("names a rise over the cap and charges the new total", () => {
    const out = applyPriceHold(priced(2828.21), hold, 50, NOW);
    expect(out.total_ghs).toBe(2828.21);
    expect(out.price_hold_ghs).toBeUndefined();
    expect(out.held_total_ghs).toBe(2693.21);
  });

  it("leaves a lower total alone (the customer gets the better price)", () => {
    const out = applyPriceHold(priced(2650), hold, 50, NOW);
    expect(out).toEqual(priced(2650));
  });

  it("holds nothing once the lock has expired, with no hold recorded, or with a 0 cap", () => {
    expect(applyPriceHold(priced(2734.21), { ...hold, expiresAt: EARLIER }, 50, NOW).total_ghs).toBe(2734.21);
    expect(applyPriceHold(priced(2734.21), { ...hold, heldUnitGhs: null }, 50, NOW).total_ghs).toBe(2734.21);
    expect(applyPriceHold(priced(2734.21), hold, 0, NOW).total_ghs).toBe(2734.21);
  });

  it("scales with quantity and keeps the customer's own store shipping outside the hold", () => {
    const out = applyPriceHold(priced(2 * 2693.21 + 30 + 100, { quantity: 2, store_shipping_ghs: 100 }), hold, 50, NOW);
    expect(out.price_hold_ghs).toBe(30);
    expect(out.total_ghs).toBe(2 * 2693.21 + 100);
  });

  it("re-derives from scratch: applying twice never stacks two holds", () => {
    const once = applyPriceHold(priced(2734.21), hold, 50, NOW);
    expect(applyPriceHold(once, hold, 50, NOW)).toEqual(once);
    expect(withoutPriceHold(once).total_ghs).toBe(2734.21);
  });
});

describe("heldUnitFor", () => {
  it("is the per-unit total without store shipping, and null for an unpriced line", () => {
    expect(heldUnitFor(priced(2 * 1000 + 50, { quantity: 2, store_shipping_ghs: 50 }))).toBe(1000);
    expect(heldUnitFor(priced(0))).toBeNull();
    expect(heldUnitFor(priced(100, { pricing_method: "needs_review" }))).toBeNull();
  });
});
