import { describe, expect, it } from "vitest";

import { CUSTOMS_ROW_LABEL, FREIGHT_ROW_LABEL } from "@/config/price-story";
import type { PricingBreakdown } from "@/lib/pricing/calculator";

import { rankCandidates, shortName, toFinderQuote, type RankInput } from "../ranking";
import type { FinderQuote } from "../types";

const quote = (totalGhs: number, freightGhs = 300, shippingGhs = 0): FinderQuote => ({
  totalGhs,
  totalUsd: totalGhs / 15,
  exchangeRate: 15,
  rows: [
    { key: "item", label: "Item", amountGhs: totalGhs - freightGhs - shippingGhs },
    ...(shippingGhs ? [{ key: "store_shipping" as const, label: "Store shipping", amountGhs: shippingGhs }] : []),
    { key: "freight", label: FREIGHT_ROW_LABEL, amountGhs: freightGhs },
  ],
});

const c = (id: string, state: RankInput["state"], total: number | null, over: Partial<RankInput> = {}): RankInput => ({
  id,
  title: `Sony WH-1000XM5 ${id}`,
  storeName: "Amazon",
  state,
  quote: total == null ? null : quote(total),
  ...over,
});

describe("rankCandidates", () => {
  it("picks the lowest landed total among fully priced candidates", () => {
    const r = rankCandidates([c("a", "priced", 1200), c("b", "priced", 900), c("c", "priced", 1000)], null);
    expect(r.bestId).toBe("b");
    expect(r.alternativeIds).toEqual(["c", "a"]);
  });

  it("never makes an unconfirmed price best, however low", () => {
    const r = rankCandidates([c("cheap", "confirming", null), c("b", "priced", 900)], null);
    expect(r.bestId).toBe("b");
    expect(r.alternativeIds).toEqual(["cheap"]);
  });

  it("never makes a far-below-market candidate best, however low", () => {
    const r = rankCandidates([c("stock", "stock_check", 500), c("b", "priced", 900)], null);
    expect(r.bestId).toBe("b");
    expect(r.why.stock).toContain("GH₵400.00 less than");
    expect(r.why.stock).toContain("check the seller before you buy");
  });

  it("has no best when nothing is fully priced, and lists the rest", () => {
    const r = rankCandidates([c("s", "stock_check", 500), c("q", "confirming", null)], null);
    expect(r.bestId).toBeNull();
    expect(r.alternativeIds).toEqual(["s", "q"]);
  });

  it("prefers within budget, and says so when nothing was under it", () => {
    const within = rankCandidates([c("a", "priced", 900), c("b", "priced", 1100)], 1000);
    expect(within.bestId).toBe("a");
    expect(within.why.a).toContain("within your budget");

    const over = rankCandidates([c("a", "priced", 1100), c("b", "priced", 1200)], 1000);
    expect(over.bestId).toBe("a");
    expect(over.why.a).toContain("GH₵100.00 over your budget");
  });

  it("writes 'why' from the real figures only", () => {
    const r = rankCandidates(
      [
        { ...c("a", "priced", 900), quote: quote(900, 300, 45) },
        { ...c("b", "priced", 1000), quote: quote(1000, 300) },
        { ...c("c", "priced", 1150), quote: quote(1150, 450) },
      ],
      null,
    );
    expect(r.why.a).toBe(
      "Lowest landed total of the 3 exact matches we priced. Sony WH-1000XM5 b on Amazon is GH₵100.00 more. Includes GH₵45.00 store shipping to our US hub.",
    );
    expect(r.why.b).toBe("GH₵100.00 more than Sony WH-1000XM5 a. Same freight, so the difference is the store price.");
    expect(r.why.c).toBe("GH₵250.00 more than Sony WH-1000XM5 a. Freight is GH₵450.00 here against GH₵300.00.");
  });
});

describe("shortName", () => {
  it("keeps the first few words before any punctuation", () => {
    expect(shortName("Sony WH-1000XM5 Wireless Noise Canceling Headphones, Black")).toBe("Sony WH-1000XM5 Wireless Noise");
    expect(shortName("Oraimo FreePods (2024)")).toBe("Oraimo FreePods");
  });
});

describe("toFinderQuote", () => {
  const breakdown = {
    pricing_method: "flat_rate",
    pricing_group: "Headphones",
    item_price: 100,
    item_currency: "USD",
    item_price_usd: 100,
    quantity: 1,
    subtotal_usd: 100,
    exchange_rate: 15.01,
    mid_market_rate: 14.43,
    tax_percentage: 0.08,
    tax_usd: 8,
    value_fee_percentage: 0.04,
    value_fee_usd: 4,
    store_shipping_usd: 5,
    store_shipping_ghs: 75.05,
    flat_rate_ghs: 285,
    total_ghs: 2041.17,
    total_pesewas: 204117,
    fee_calculation_note: "Flat rate for headphones",
  } as PricingBreakdown;

  it("lays the calculator's own figures out with the shared price-story labels, summing to the total", () => {
    const q = toFinderQuote(breakdown);
    expect(q.totalGhs).toBe(2041.17);
    expect(q.rows.map((r) => r.key)).toEqual(["item", "tax", "fee", "store_shipping", "freight", "customs"]);
    expect(q.rows.find((r) => r.key === "fee")?.label).toBe("Tomame fee – 4% flat");
    expect(q.rows.find((r) => r.key === "freight")?.label).toBe(FREIGHT_ROW_LABEL);
    expect(q.rows.find((r) => r.key === "customs")).toEqual({ key: "customs", label: CUSTOMS_ROW_LABEL, amountGhs: 0 });
    const sum = q.rows.reduce((n, r) => n + r.amountGhs, 0);
    expect(Math.round(sum * 100) / 100).toBe(2041.17);
  });

  it("leaves out store shipping when the store charges none", () => {
    const q = toFinderQuote({ ...breakdown, store_shipping_usd: 0, store_shipping_ghs: 0 });
    expect(q.rows.some((r) => r.key === "store_shipping")).toBe(false);
  });
});
