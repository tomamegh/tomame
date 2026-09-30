import { describe, expect, it } from "vitest";

import { reviveRegion } from "../region-revive";
import { mapRedsky, targetTcinOf } from "../resolvers/target-redsky";
import { storeForUrl } from "../stores";
import type { ExtractionResult } from "../types";
import { inferRegion } from "../url";

describe("inferRegion (unregistered stores, 2026-09-30)", () => {
  it("prices a dollar store on a .com as a US order", () => {
    expect(inferRegion("https://www.somebrand.com/products/x", "USD")).toBe("USA");
    expect(inferRegion("https://shop.example.com/x", null)).toBe("USA");
  });
  it("reads the UK and China from their addresses", () => {
    expect(inferRegion("https://www.shop.co.uk/p/1", null)).toBe("UK");
    expect(inferRegion("https://www.shop.co.uk/p/1", "GBP")).toBe("UK");
    expect(inferRegion("https://item.shop.cn/p/1", "USD")).toBe("CHINA");
  });
  it("does not call a Canadian or German store American", () => {
    expect(inferRegion("https://www.shop.ca/p/1", "CAD")).toBeNull();
    expect(inferRegion("https://www.shop.ca/p/1", "USD")).toBeNull();
    expect(inferRegion("https://www.shop.de/p/1", "EUR")).toBeNull();
  });
  it("falls back to the currency with no address", () => {
    expect(inferRegion(null, "GBP")).toBe("UK");
    expect(inferRegion(null, "EUR")).toBeNull();
  });
});

describe("named stores", () => {
  it("knows Fashion Nova ships from the US", () => {
    const store = storeForUrl("https://www.fashionnova.com/products/brenda-halter-mesh-maxi-dress");
    expect(store?.name).toBe("Fashion Nova");
    expect(store?.region).toBe("USA");
  });
  it("knows ASOS is a UK store", () => {
    expect(storeForUrl("https://www.asos.com/prd/123")?.region).toBe("UK");
  });
});

describe("reviveRegion (cached rows written before inference)", () => {
  const base = (over: Partial<ExtractionResult>): ExtractionResult =>
    ({
      extraction_attempted: true,
      extraction_success: true,
      platform: "generic",
      country: null,
      product: { currency: "USD" },
      messages: [
        "We don't know this store yet. Our team will confirm where it ships from before purchase.",
        "Price could not be read from the page.",
      ],
      errors: [],
      ...over,
    }) as unknown as ExtractionResult;

  it("fills the country from the currency and drops the old store notes", () => {
    const out = reviveRegion(base({}));
    expect(out.country).toBe("USA");
    expect(out.messages).toEqual(["Price could not be read from the page."]);
  });
  it("leaves a region it cannot work out with one gentle note", () => {
    const out = reviveRegion(base({ product: { currency: "EUR" } as ExtractionResult["product"] }));
    expect(out.country).toBeNull();
    expect(out.messages.join(" ")).toMatch(/confirm which country/);
    expect(out.messages.join(" ")).not.toMatch(/don't know this store/);
  });
});

describe("Target product API", () => {
  it("finds the TCIN in a product URL", () => {
    expect(targetTcinOf("https://www.target.com/p/stanley-40-oz/-/A-88429520")).toBe("88429520");
    expect(targetTcinOf("https://www.target.com/c/tumblers")).toBeNull();
  });
  it("reads the price, not the review count", () => {
    const p = mapRedsky({
      price: { current_retail: 45, formatted_current_price: "$45.00" },
      item: { product_description: { title: "Stanley 40 oz Quencher" }, primary_brand: { name: "Stanley 1913" } },
      ratings_and_reviews: { statistics: { rating: { average: 4.31, count: 11534 } } },
    });
    expect(p.price).toBe(45);
    expect(p.review_count).toBe(11534);
    expect(p.currency).toBe("USD");
  });
  it("leaves a variant price range unset rather than guessing", () => {
    expect(mapRedsky({ price: { current_retail_min: 20, current_retail_max: 35 } }).price).toBeNull();
    expect(mapRedsky({ price: { current_retail_min: 20, current_retail_max: 20 } }).price).toBe(20);
  });
});
