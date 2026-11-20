import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { amazonPagePrices, amazonScraper } from "../amazon";
import { guardHtmlPrice, assessPriceConfidence } from "../../price-confidence";
import { withProductDefaults } from "../types";

const ruko = readFileSync(resolve(__dirname, "fixtures", "amazon-ruko-geo.html"), "utf-8");
const desk = readFileSync(resolve(__dirname, "fixtures", "amazon-desk-full.html"), "utf-8");

const extract = (html: string) => amazonScraper.extract(cheerio.load(html));

describe("Amazon HTML parser — Ruko 1088 (A1, A2)", () => {
  const product = extract(ruko);

  it("reads $83.55, not 8355, from a locale-style screen-reader price", () => {
    expect(product.price).toBe(83.55);
    expect(product.currency).toBe("USD");
  });

  it("never copies an inline script into availability", () => {
    expect(product.availability ?? "").not.toMatch(/P\.when|function\s*\(/);
  });

  it("treats 'cannot be shipped to your selected delivery location' as a geo problem, not stock", () => {
    expect(product.availability).toBeNull();
    expect(product.metadata.geoBlocked).toBe(true);
  });

  it("strips scripts out of every text it reads (bullets too)", () => {
    expect(product.description).toContain("GPS return to home.");
    expect(product.description).not.toMatch(/P\.when|A\.trigger/);
    expect(product.title).toBe("Ruko 1088 Drone with 4K Camera for Adults, GPS Quadcopter with 60 Mins Flight Time");
  });

  it("keeps every same-page price reading for the guard, ignoring the per-unit line", () => {
    const reads = amazonPagePrices(cheerio.load(ruko));
    expect(reads.map((r) => r.price)).toEqual([83.55, 83.55, 83.55, 83.55]);
    expect(reads.map((r) => r.via)).toEqual(["core-offscreen", "whole-fraction", "twister", "attach"]);
  });

  it("refuses a reading with no decimal point when the page renders cents", () => {
    const html = ruko.replace('<span class="a-offscreen">83,55 $</span>', '<span class="a-offscreen">$8355</span>');
    expect(html).not.toBe(ruko);
    const p = extract(html);
    expect(p.price).toBe(83.55);
    expect(p.metadata.priceVia).toBe("whole-fraction");
  });

  it("a page-only price is unconfirmed (shown, Pay held) when read from abroad", () => {
    const verdict = assessPriceConfidence({
      storeCurrency: "USD",
      product: withProductDefaults(product),
      priceSource: "platform-html",
      reads: [{ source: "platform-html", price: 83.55, currency: "USD" }],
    });
    expect(verdict?.level).toBe("unconfirmed");
    expect(verdict?.reasons).toEqual(expect.arrayContaining(["html_only", "geo_blocked"]));
  });

  it("A3: a page whose own hidden price disagrees with the shown one is never quoted", () => {
    const p = extract(ruko.replace('id="twister-plus-price-data-price" value="83.55"', 'id="twister-plus-price-data-price" value="91.20"'));
    expect(guardHtmlPrice({ storeCurrency: "USD", product: withProductDefaults(p), priceSource: "platform-html", reads: [] })).toBe("page_disagrees");
  });

  it("A3: the 8355 the old parser produced would be thrown out as implausible for its category", () => {
    const p = withProductDefaults({ ...product, price: 8355, metadata: {} });
    expect(guardHtmlPrice({ storeCurrency: "USD", product: p, priceSource: "platform-html", reads: [] })).toBe("implausible");
  });
});

describe("Amazon HTML parser — full desk page still reads", () => {
  const product = extract(desk);
  it("reads the price and keeps availability plain", () => {
    expect(product.price).toBe(149.98);
    expect(product.availability).toBe("In Stock");
    expect(product.metadata.geoBlocked).toBe(false);
    expect(product.condition).toBeNull();
  });
  it("has no offer flags on a plain new-item page", () => {
    expect(product.metadata.priceFlags).toEqual([]);
    expect(product.metadata.deal).toBeNull();
  });
});
