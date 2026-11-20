import { describe, it, expect } from "vitest";
import { buildQuoteHealth, quoteHealthCandidates, quoteHealthLines, type QuoteHealthInput, type QuoteRowInput } from "../quote-health";

const q = (over: Partial<QuoteRowInput>): QuoteRowInput => ({
  platform: "amazon", price_source: "scraperapi", source: "scraperapi", price: 20, confidence: "confirmed", leaked: 0, price_rejected: false, ...over,
});
const input = (over: Partial<QuoteHealthInput> = {}): QuoteHealthInput => ({
  quotes: [],
  stuckPastes: 0,
  checksWaiting: { price: 0, stock: 0, oldestMinutes: null },
  paid: [],
  notificationsStuck: { count: 0, oldestMinutes: null },
  bellOnlyPending: 0,
  ...over,
});
const keys = (i: QuoteHealthInput) => quoteHealthCandidates(buildQuoteHealth(i)).map((c) => c.key);

describe("quote health (A6)", () => {
  it("a healthy day raises nothing", () => {
    expect(keys(input({ quotes: Array.from({ length: 10 }, () => q({})) }))).toEqual([]);
  });

  it("counts HTML-only, unconfirmed, rejected and leaked; Amazon structured failure from the price tier", () => {
    const h = buildQuoteHealth(
      input({
        quotes: [
          q({}),
          q({ price_source: "platform-html", confidence: "unconfirmed", leaked: 2 }),
          q({ price_source: null, source: "oxylabs", price: null }),
          q({ price: null, price_source: null, price_rejected: true }),
          q({ platform: "ebay", price_source: "ebay" }),
        ],
      }),
    );
    expect(h).toMatchObject({ quotes: 5, priced: 3, htmlOnly: 1, unconfirmed: 1, priceRejected: 1, leakedScripts: 2 });
    expect(h.amazon).toEqual({ quotes: 4, structuredPriced: 1, failureRate: 0.75 });
  });

  it("alerts on each threshold", () => {
    const amazonDown = Array.from({ length: 8 }, () => q({ price_source: "platform-html", confidence: "unconfirmed" }));
    expect(keys(input({ quotes: amazonDown }))).toEqual(expect.arrayContaining(["quotes:html-only", "quotes:amazon-structured"]));
    expect(keys(input({ quotes: [q({ leaked: 1 })] }))).toEqual(["quotes:leaked-script"]);
    expect(keys(input({ quotes: [1, 2, 3].map(() => q({ price: null, price_rejected: true })) }))).toContain("quotes:price-rejected");
    expect(keys(input({ stuckPastes: 3 }))).toEqual(["quotes:stuck-pastes"]);
    expect(keys(input({ checksWaiting: { price: 1, stock: 0, oldestMinutes: 121 } }))).toEqual(["quotes:checks-waiting"]);
    expect(keys(input({ notificationsStuck: { count: 2, oldestMinutes: 45 } }))).toEqual(["notifications:stuck"]);
  });

  it("bell-only email rows are reported, never alerted", () => {
    expect(keys(input({ bellOnlyPending: 103 }))).toEqual([]);
    expect(quoteHealthLines(buildQuoteHealth(input({ bellOnlyPending: 103 }))).join(" ")).toContain("never sent by design): 103");
  });

  it("quoted-vs-paid drift by store and tier, same currency only", () => {
    const paid = [
      { platform: "amazon", tier: "scraperapi", quoted_price: 100, quoted_currency: "USD", paid_price: 110, paid_currency: "USD" },
      { platform: "amazon", tier: "scraperapi", quoted_price: 50, quoted_currency: "USD", paid_price: 55, paid_currency: "USD" },
      { platform: "ebay", tier: "ebay", quoted_price: 20, quoted_currency: "USD", paid_price: 19, paid_currency: "USD" },
      { platform: "amazon", tier: "scraperapi", quoted_price: 20, quoted_currency: "GBP", paid_price: 30, paid_currency: "USD" },
    ];
    const h = buildQuoteHealth(input({ paid }));
    expect(h.drift.orders).toBe(3);
    expect(h.drift.medianAbs).toBe(0.1);
    expect(h.drift.groups[0]).toMatchObject({ key: "amazon/scraperapi", orders: 2, medianDrift: 0.1 });
    expect(quoteHealthCandidates(h).map((c) => c.key)).toEqual(["quotes:drift"]);
  });
});
