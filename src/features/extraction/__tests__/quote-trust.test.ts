import { describe, it, expect, vi } from "vitest";
import * as cheerio from "cheerio";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { looksLikeScript, parseShelfPrice, textOf } from "../scrapers/parse";
import { emptyProduct, type ScrapedProduct } from "../scrapers/types";
import { mergeResult, type MergeState } from "../resolvers/merge";
import { assessPriceConfidence, guardHtmlPrice, judgeReread, priceCeilingFor, pricesAgree, type PriceRead } from "../price-confidence";
import { detectStockSignals, storeSaysUnavailable } from "../stock-signals";
import { checksNeeded, payHoldOf, payHoldRefusal, PRICE_RECHECK_MAX_PENDING_MS, type QuoteCheckState } from "../pay-gate";
import type { ExtractionResult } from "../types";

const product = (p: Partial<ScrapedProduct>): ScrapedProduct => ({ ...emptyProduct(), title: "Item", price: 50, currency: "USD", ...p, metadata: { ...(p.metadata ?? {}) } });

describe("parseShelfPrice", () => {
  it.each([
    ["$83.55", 83.55, "USD", true],
    ["83,55 $", 83.55, "USD", true],
    ["EUR 1.299,00", 1299, "EUR", true],
    ["US$1,299.00", 1299, "USD", true],
    ["$1,299", 1299, "USD", false],
    ["£84", 84, "GBP", false],
    ["8355", 8355, null, false],
  ])("%s → %s %s", (raw, price, currency, cents) => {
    expect(parseShelfPrice(raw)).toEqual({ price, currency, hasCents: cents });
  });
  it("reads nothing from text without a number", () => {
    expect(parseShelfPrice("See price in cart").price).toBeNull();
    expect(parseShelfPrice(null).price).toBeNull();
  });
});

describe("textOf / looksLikeScript (A2)", () => {
  it("drops script, style and noscript bodies without touching the page", () => {
    const $ = cheerio.load(`<div id="a"><span>In Stock<script>P.when("A").execute(function(){})</script><style>.x{}</style><noscript>enable js</noscript></span></div>`);
    expect(textOf($("#a")).trim()).toBe("In Stock");
    expect($("#a script").length).toBe(1);
  });
  it.each([
    `P.when("A","load").execute("aod-assets-loaded", function(A){})`,
    "window.ue_t0 = 1",
    `{"isInternal":false,"asin":"B0"}`,
    "var x = 1;",
  ])("flags %s as script", (s) => expect(looksLikeScript(s)).toBe(true));
  it.each(["In Stock", "Only 2 left in stock - order soon.", "Function generator 20MHz", "4.5 out of 5"])("leaves %s alone", (s) =>
    expect(looksLikeScript(s)).toBe(false),
  );
});

describe("merge script guard (A2)", () => {
  it("drops a JS-shaped field and records it, keeping the rest", () => {
    const state: MergeState = { product: emptyProduct(), confidence: {}, sources: {} };
    mergeResult(state, "platform-html", { product: { title: "Drone", availability: `P.when("A").execute(function(A){}) Ships soon`, specifications: { Weight: "1 lb", Bad: "var a = 1;" } } }, 0.9);
    expect(state.product.title).toBe("Drone");
    expect(state.product.availability).toBeNull();
    expect(state.product.specifications).toEqual({ Weight: "1 lb" });
    expect(state.leaked).toEqual([
      { field: "availability", source: "platform-html" },
      { field: "specifications.Bad", source: "platform-html" },
    ]);
  });
  it("keeps offer facts with the tier that owns the price only", () => {
    const state: MergeState = { product: emptyProduct(), confidence: {}, sources: {} };
    mergeResult(state, "scraperapi", { product: { title: "X", price: 10, currency: "USD" } }, 0.95);
    mergeResult(state, "platform-html", { product: { price: 11, metadata: { geoBlocked: true, priceFlags: ["coupon"] } } }, 0.9);
    expect(state.sources.price).toBe("scraperapi");
    expect(state.product.metadata.geoBlocked).toBeUndefined();
    expect(state.product.metadata.priceFlags).toBeUndefined();
  });
});

describe("price confidence (A0)", () => {
  const read = (source: PriceRead["source"], price: number): PriceRead => ({ source, price, currency: "USD" });

  it("an exact-offer vendor read is confirmed on its own", () => {
    const v = assessPriceConfidence({ storeCurrency: "USD", product: product({ price: 30 }), priceSource: "scraperapi", reads: [read("scraperapi", 30)] });
    expect(v).toEqual({ level: "confirmed", reasons: ["exact_offer"], source: "scraperapi" });
  });
  it("two tiers agreeing within 2% confirm a Zyte price", () => {
    const v = assessPriceConfidence({ storeCurrency: "USD", product: product({ price: 100 }), priceSource: "zyte", reads: [read("zyte", 100), read("structured-data", 101.5)] });
    expect(v?.level).toBe("confirmed");
  });
  it("Zyte's AI read that matches the page's own offer is confirmed", () => {
    const v = assessPriceConfidence({ storeCurrency: "USD", product: product({ metadata: { pageOfferAgrees: true } }), priceSource: "zyte", reads: [read("zyte", 50)] });
    expect(v?.level).toBe("confirmed");
  });
  it("a lone Zyte read is single_source", () => {
    const v = assessPriceConfidence({ storeCurrency: "USD", product: product({}), priceSource: "zyte", reads: [read("zyte", 50)] });
    expect(v).toEqual({ level: "single_source", reasons: ["one_read"], source: "zyte" });
  });
  it.each([
    ["html only", product({}), "platform-html", [read("platform-html", 50)], "html_only"],
    ["disagreement > 2%", product({}), "zyte", [read("zyte", 50), read("oxylabs", 52)], "reads_disagree"],
    ["implausible", product({ price: 9000, category: "Toys & Games" as ScrapedProduct["category"] }), "scraperapi", [], "implausible"],
    ["non-USD", product({ currency: "EUR" }), "scraperapi", [], "currency_mismatch"],
    ["used offer on a new page", product({ metadata: { priceFlags: ["used_offer"] } }), "scraperapi", [], "used_offer"],
    ["subscribe & save", product({ metadata: { priceFlags: ["subscribe_and_save"] } }), "scraperapi", [], "subscribe_and_save"],
    ["coupon", product({ metadata: { priceFlags: ["coupon"] } }), "scraperapi", [], "coupon"],
    ["per unit", product({ metadata: { priceFlags: ["per_unit"] } }), "scraperapi", [], "per_unit"],
    ["another variant", product({ metadata: { asinMismatch: true } }), "scraperapi", [], "variant_mismatch"],
  ] as const)("%s → unconfirmed", (_label, p, source, reads, reason) => {
    const v = assessPriceConfidence({ storeCurrency: "USD", product: p, priceSource: source, reads });
    expect(v?.level).toBe("unconfirmed");
    expect(v?.reasons).toContain(reason);
  });
  it("our own page parse does not overrule a vendor's exact read", () => {
    const v = assessPriceConfidence({ storeCurrency: "USD", product: product({ price: 83.55 }), priceSource: "scraperapi", reads: [read("scraperapi", 83.55), read("platform-html", 8355)] });
    expect(v?.level).toBe("confirmed");
  });
  it("a renewed listing's own price is not a 'used offer on a new page'", () => {
    const v = assessPriceConfidence({ storeCurrency: "USD", product: product({ title: "iPhone 13 (Renewed)", metadata: { priceFlags: ["used_offer"] } }), priceSource: "scraperapi", reads: [] });
    expect(v?.level).toBe("confirmed");
  });
  it("no price, no verdict", () => {
    expect(assessPriceConfidence({ storeCurrency: "USD", product: product({ price: null }), priceSource: null, reads: [] })).toBeNull();
  });
  it("ceilings and agreement", () => {
    expect(priceCeilingFor("Electronics")).toBeGreaterThan(priceCeilingFor("Toys & Games"));
    expect(pricesAgree(100, 102)).toBe(true);
    expect(pricesAgree(100, 102.1)).toBe(false);
  });
});

describe("HTML price guard (A3)", () => {
  it("never rejects a price a vendor agreed with", () => {
    const p = product({ price: 50, metadata: { pagePrices: [{ via: "twister", price: 70 }] } });
    expect(guardHtmlPrice({ storeCurrency: "USD", product: p, priceSource: "platform-html", reads: [{ source: "scraperapi", price: 50, currency: "USD" }] })).toBeNull();
  });
  it("rejects a page read abroad in another currency", () => {
    const p = product({ currency: "GHS", metadata: { geoBlocked: true } });
    expect(guardHtmlPrice({ storeCurrency: "USD", product: p, priceSource: "platform-html", reads: [] })).toBe("geo_blocked_currency");
  });
  it("leaves vendor-tier prices alone", () => {
    expect(guardHtmlPrice({ storeCurrency: "USD", product: product({ price: 99999 }), priceSource: "scraperapi", reads: [] })).toBeNull();
  });
});

describe("judgeReread", () => {
  it("agree / disagree / none", () => {
    expect(judgeReread({ price: 50, currency: "USD" }, [{ source: "structured-data", price: 50.5, currency: "USD" }]).outcome).toBe("agree");
    expect(judgeReread({ price: 50, currency: "USD" }, [{ source: "structured-data", price: 60, currency: "USD" }]).outcome).toBe("disagree");
    expect(judgeReread({ price: 50, currency: "USD" }, [{ source: "structured-data", price: 60, currency: "EUR" }]).outcome).toBe("none");
    expect(judgeReread({ price: 50, currency: "USD" }, []).outcome).toBe("none");
  });
});

describe("storeSaysUnavailable (106)", () => {
  it("is the store's own word, not a failed read", () => {
    expect(storeSaysUnavailable(product({ price: null, availability: "Currently unavailable." }))).toBe(true);
    expect(storeSaysUnavailable(product({ price: null, metadata: { availability: "Out of Stock" } }))).toBe(true);
    expect(storeSaysUnavailable(product({ price: null }))).toBe(false); // nothing read
    expect(storeSaysUnavailable(product({ price: 20, availability: "Out of stock" }))).toBe(false);
    expect(storeSaysUnavailable(product({ title: null, price: null, availability: "Out of stock" }))).toBe(false);
  });
});

describe("stock signals (A7)", () => {
  it.each([
    [{ title: "Apple iPhone 13, 128GB (Renewed)" }, "condition"],
    [{ title: "Echo Dot Amazon Renewed" }, "condition"],
    [{ condition: "Used - Like New" }, "condition"],
    [{ condition: "Open box" }, "condition"],
    [{ availability: "Only 2 left in stock - order soon." }, "low_stock"],
    [{ availability: "Temporarily out of stock." }, "temporarily_out"],
    [{ availability: "Usually ships within 2 to 3 weeks." }, "slow_dispatch"],
    [{ metadata: { deal: "Lightning Deal" } }, "deal"],
    [{ metadata: { deal: "Limited time deal" } }, "deal"],
  ] as const)("%o → %s", (p, code) => {
    expect(detectStockSignals(product(p as Partial<ScrapedProduct>)).map((s) => s.code)).toContain(code);
  });
  it.each([
    [{ availability: "In Stock" }],
    [{ availability: "Only 7 left in stock" }],
    [{ condition: "New" }],
    [{ condition: "Brand New" }],
    [{ title: "Refrigerator ice maker" }],
  ] as const)("no check for %o", (p) => {
    expect(detectStockSignals(product(p as Partial<ScrapedProduct>))).toEqual([]);
  });
});

describe("pay gate (A0 + A7 + freight)", () => {
  const NOW = Date.parse("2026-11-20T12:00:00Z");
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
  const ext = (p: Partial<ScrapedProduct>, level: "confirmed" | "single_source" | "unconfirmed" | null = "confirmed", freight?: ExtractionResult["freight_inspection"]) =>
    ({ product: product(p), price_confidence: level ? { level, reasons: [], source: "zyte" } : null, freight_inspection: freight }) as Pick<ExtractionResult, "product" | "price_confidence" | "freight_inspection">;
  const check = (c: Partial<QuoteCheckState>): QuoteCheckState => ({
    kind: "price", origin: "system", status: "pending", created_at: iso(1000), valid_until: null, confirmed_price: null, substitute_url: null, ...c,
  });

  it("a confirmed price on a plain listing is payable", () => {
    expect(payHoldOf({ extraction: ext({}), checks: [], now: NOW })).toBeNull();
  });
  it("freight comes first", () => {
    const freight = { status: "pending", inspected_at: iso(1000) } as ExtractionResult["freight_inspection"];
    expect(payHoldOf({ extraction: ext({}, "unconfirmed", freight), checks: [], now: NOW })?.kind).toBe("freight_check");
  });
  it("an unconfirmed price is re-read automatically first, until a confirmation for THIS price", () => {
    const e = ext({}, "unconfirmed");
    expect(payHoldOf({ extraction: e, checks: [], now: NOW })).toMatchObject({ kind: "price_check", needs_staff: false, message: "Checking this price with the store" });
    expect(checksNeeded({ extraction: e, checks: [], now: NOW }).price).toBe("checking");
    const running = check({ status: "checking", created_at: iso(5_000) });
    expect(payHoldOf({ extraction: e, checks: [running], now: NOW })).toMatchObject({ needs_staff: false });
    expect(checksNeeded({ extraction: e, checks: [running], now: NOW }).price).toBeNull();
    const ok = check({ status: "confirmed", confirmed_price: 50, valid_until: iso(-3600_000) });
    expect(payHoldOf({ extraction: ext({}, "unconfirmed"), checks: [ok], now: NOW })).toBeNull();
    expect(payHoldOf({ extraction: ext({ price: 55 }, "unconfirmed"), checks: [ok], now: NOW })?.kind).toBe("price_check");
    const expired = { ...ok, valid_until: iso(1) };
    expect(payHoldOf({ extraction: ext({}, "unconfirmed"), checks: [expired], now: NOW })?.kind).toBe("price_check");
  });
  it("a single-source price is held while its re-read runs, and released when it lapses", () => {
    const e = ext({}, "single_source");
    expect(checksNeeded({ extraction: e, checks: [], now: NOW }).price).toBe("checking");
    const running = check({ status: "checking", created_at: iso(5_000) });
    expect(payHoldOf({ extraction: e, checks: [running], now: NOW })).toMatchObject({ kind: "price_check", needs_staff: false });
    expect(checksNeeded({ extraction: e, checks: [running], now: NOW }).price).toBeNull();
    const lost = check({ status: "checking", created_at: iso(PRICE_RECHECK_MAX_PENDING_MS + 1) });
    expect(payHoldOf({ extraction: e, checks: [lost], now: NOW })).toBeNull();
    expect(payHoldOf({ extraction: e, checks: [check({ status: "lapsed" })], now: NOW })).toBeNull();
    expect(payHoldOf({ extraction: e, checks: [check({ status: "pending", reread_at: iso(1000) })], now: NOW })).toMatchObject({ needs_staff: true });
  });
  it("an unconfirmed price the re-read could not confirm waits on staff, never lapses to payable", () => {
    const e = ext({}, "unconfirmed");
    const afterReread = check({ status: "pending", reread_at: iso(1000) });
    expect(payHoldOf({ extraction: e, checks: [afterReread], now: NOW })).toMatchObject({ needs_staff: true, message: "We're confirming this price" });
    expect(checksNeeded({ extraction: e, checks: [afterReread], now: NOW }).price).toBeNull();
    // A run lost mid-read: held on staff and handed to them.
    const lost = check({ status: "checking", created_at: iso(PRICE_RECHECK_MAX_PENDING_MS + 1) });
    expect(payHoldOf({ extraction: e, checks: [lost], now: NOW })).toMatchObject({ needs_staff: true });
    expect(checksNeeded({ extraction: e, checks: [lost], now: NOW }).price).toBe("settle");
    // A lapsed row (from the single-source rule) never makes an unconfirmed price payable.
    expect(payHoldOf({ extraction: e, checks: [check({ status: "lapsed" })], now: NOW })?.kind).toBe("price_check");
  });
  it("a staff check opened before re-reads existed is re-read once, idempotently", () => {
    const e = ext({}, "unconfirmed");
    const legacy = check({ status: "pending", created_at: iso(3 * 3600_000), reread_at: null });
    expect(checksNeeded({ extraction: e, checks: [legacy], now: NOW }).price).toBe("reread");
    expect(payHoldOf({ extraction: e, checks: [legacy], now: NOW })).toMatchObject({ needs_staff: false });
    // Moved to checking: the run is timed from the move, not from when the row opened.
    const moved = { ...legacy, status: "checking" as const, updated_at: iso(2_000) };
    expect(checksNeeded({ extraction: e, checks: [moved], now: NOW }).price).toBeNull();
    expect(payHoldOf({ extraction: e, checks: [moved], now: NOW })).toMatchObject({ needs_staff: false });
    // A customer report is never re-read or counted.
    expect(checksNeeded({ extraction: e, checks: [check({ origin: "customer", status: "pending" })], now: NOW }).price).toBe("checking");
  });
  it("stock signals never hold payment and open no stock check", () => {
    const renewed = ext({ title: "Kindle (Renewed)" });
    expect(payHoldOf({ extraction: renewed, checks: [], now: NOW })).toBeNull();
    expect(checksNeeded({ extraction: renewed, checks: [], now: NOW }).stock).toBe(false);
    const pending = check({ kind: "stock", status: "pending" });
    expect(payHoldOf({ extraction: renewed, checks: [pending], now: NOW })).toBeNull();
  });
  it("unavailable beats everything but freight, and carries the substitute", () => {
    const gone = check({ kind: "stock", status: "unavailable", valid_until: iso(-1000), substitute_url: "https://www.amazon.com/dp/B000000001" });
    expect(payHoldOf({ extraction: ext({ title: "Kindle (Renewed)" }, "unconfirmed"), checks: [gone], now: NOW })).toMatchObject({
      kind: "unavailable",
      substitute_url: "https://www.amazon.com/dp/B000000001",
    });
  });
  it("a customer report never clears or sets a hold", () => {
    const report = check({ origin: "customer", status: "pending" });
    expect(payHoldOf({ extraction: ext({}), checks: [report], now: NOW })).toBeNull();
  });
  it("refusal copy names the item", () => {
    expect(payHoldRefusal({ kind: "price_check", message: "", needs_staff: true }, "Ruko 1088")).toContain("“Ruko 1088”");
    expect(payHoldRefusal({ kind: "unavailable", message: "", needs_staff: false }, null)).toMatch(/^One of your items is no longer available/);
  });
});
