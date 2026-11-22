import { describe, expect, it } from "vitest";

import { carryPriceHistory, priceContextFacts, priceContextOf, priceContextParts, shoppingSeasonNote } from "../price-context";
import type { ExtractionResult } from "../types";

const NOW = Date.parse("2026-11-22T20:20:00Z");

function result(price: number | null, extra: { listPrice?: number; deal?: string; history?: ExtractionResult["price_history"]; currency?: string; at?: string } = {}) {
  return {
    product: { price, currency: extra.currency ?? "USD", metadata: { ...(extra.listPrice != null ? { listPrice: extra.listPrice } : {}), ...(extra.deal ? { deal: extra.deal } : {}) } },
    fetched_at: extra.at ?? "2026-11-22T20:20:00Z",
    price_history: extra.history,
  } as unknown as ExtractionResult;
}

describe("priceContextOf — the Armani case", () => {
  it("names the store's own discount off its list price", () => {
    const ctx = priceContextOf(result(96.6, { listPrice: 138 }), NOW);
    expect(ctx).toMatchObject({ price: 96.6, listPrice: 138, savingPct: 30, previous: null });
    expect(priceContextParts(ctx, "Amazon")).toEqual(["30% off Amazon's $138.00 list price"]);
    expect(priceContextFacts(ctx)).toBe("price facts: store list price $138.00, today $96.60 (30% off)");
  });

  it("says what we read before, with the day", () => {
    const ctx = priceContextOf(result(96.6, { listPrice: 138, history: [{ price: 138, currency: "USD", at: "2026-11-21T18:45:54Z" }] }), NOW);
    expect(priceContextParts(ctx, "Amazon")).toEqual(["30% off Amazon's $138.00 list price", "Down from $138.00 when we checked on 21 Nov"]);
  });

  it("says a rise plainly", () => {
    const ctx = priceContextOf(result(120, { history: [{ price: 100, currency: "USD", at: "2026-11-20T10:00:00Z" }] }), NOW);
    expect(priceContextParts(ctx, "Walmart")).toEqual(["Up from $100.00 when we checked on 20 Nov"]);
  });

  it("claims nothing without facts, a tiny list-price gap, or an absurd one", () => {
    expect(priceContextOf(result(96.6), NOW)).toBeNull();
    expect(priceContextOf(result(100, { listPrice: 101 }), NOW)).toBeNull();
    expect(priceContextOf(result(10, { listPrice: 500 }), NOW)).toBeNull();
    expect(priceContextOf(result(100, { listPrice: 90 }), NOW)).toBeNull();
    expect(priceContextOf(result(null, { listPrice: 138 }), NOW)).toBeNull();
  });

  it("ignores an old read, another currency, and one at today's price", () => {
    const history = [
      { price: 150, currency: "USD", at: "2026-08-01T00:00:00Z" },
      { price: 99, currency: "GBP", at: "2026-11-21T00:00:00Z" },
      { price: 96.6, currency: "USD", at: "2026-11-21T12:00:00Z" },
    ];
    expect(priceContextOf(result(96.6, { history }), NOW)).toBeNull();
  });

  it("passes the store's own deal badge through, word for word", () => {
    const ctx = priceContextOf(result(50, { deal: "Black Friday Deal" }), NOW);
    expect(ctx?.dealLabel).toBe("Black Friday Deal");
    expect(priceContextFacts(ctx)).toContain('store\'s own deal badge: "Black Friday Deal"');
  });
});

describe("carryPriceHistory", () => {
  it("keeps the old price when a re-read changes it", () => {
    const next = carryPriceHistory(result(138, { at: "2026-11-21T18:45:54Z" }), result(96.6));
    expect(next.price_history).toEqual([{ price: 138, currency: "USD", at: "2026-11-21T18:45:54Z" }]);
  });

  it("adds nothing when the price is the same, and keeps what it had", () => {
    const kept = [{ price: 150, currency: "USD", at: "2026-11-10T00:00:00Z" }];
    expect(carryPriceHistory(result(138, { history: kept }), result(138)).price_history).toEqual(kept);
  });

  it("keeps the history through a read with no price", () => {
    const kept = [{ price: 150, currency: "USD", at: "2026-11-10T00:00:00Z" }];
    expect(carryPriceHistory(result(138, { history: kept }), result(null)).price_history).toEqual(kept);
  });

  it("starts over in another currency and caps at five", () => {
    expect(carryPriceHistory(result(100, { currency: "GBP" }), result(96.6)).price_history).toBeUndefined();
    const many = [1, 2, 3, 4, 5].map((n) => ({ price: n, currency: "USD", at: `2026-11-0${n}T00:00:00Z` }));
    const next = carryPriceHistory(result(10, { history: many }), result(11));
    expect(next.price_history).toHaveLength(5);
    expect(next.price_history?.at(-1)?.price).toBe(10);
  });

  it("works with nothing stored", () => {
    expect(carryPriceHistory(null, result(96.6)).price_history).toBeUndefined();
  });
});

describe("shoppingSeasonNote", () => {
  it("names Black Friday 2026 (27 Nov) and Cyber Monday (30 Nov) in season", () => {
    const note = shoppingSeasonNote(new Date(NOW));
    expect(note).toContain("Fri 27 Nov 2026");
    expect(note).toContain("Mon 30 Nov");
  });

  it("is silent out of season", () => {
    expect(shoppingSeasonNote(new Date("2026-10-01T00:00:00Z"))).toBeNull();
    expect(shoppingSeasonNote(new Date("2026-12-10T00:00:00Z"))).toBeNull();
  });
});
