import { describe, expect, it } from "vitest";

import { catalogStoreFor, deriveCatalogTerm } from "../services/catalog-term";

/**
 * These pin the judgement, not the implementation. Every input below is a real
 * shape seen in `extraction_cache`, and the question each one asks is the same:
 * would a person shopping for this product type this phrase?
 */
describe("deriveCatalogTerm", () => {
  it("cuts a carrier-prefixed phone title down to the model", () => {
    // Verbatim, this searches for that exact phone in that exact colour at that
    // exact capacity from that exact carrier, which returns the same product
    // rather than similar ones.
    expect(deriveCatalogTerm("AT&T Samsung Galaxy S24 Ultra Titanium Violet 512GB", "Samsung")).toBe(
      "Samsung Galaxy S24 Ultra",
    );
  });

  it("stops at the separator that introduces the variant", () => {
    expect(
      deriveCatalogTerm("Oraimo BoomPop N Wireless Over-Ear Headphones · Black", "Oraimo"),
    ).toBe("Oraimo BoomPop N Wireless");
  });

  it("drops parenthetical options", () => {
    expect(deriveCatalogTerm("Apple AirPods Pro (2nd Generation)", "Apple")).toBe(
      "Apple AirPods Pro",
    );
  });

  it("puts a buried brand in front rather than on the end", () => {
    // "Headphones Anker" is not a phrase anyone types.
    const term = deriveCatalogTerm("Soundcore Life Q30 Headphones", "Anker");
    expect(term?.startsWith("Anker")).toBe(true);
  });

  it("does not repeat a brand the title already leads with", () => {
    const term = deriveCatalogTerm("Sony WH-1000XM5 Wireless Headphones", "Sony");
    expect(term).toBe("Sony WH-1000XM5 Wireless Headphones");
    expect((term ?? "").toLowerCase().split("sony").length - 1).toBe(1);
  });

  it("keeps a spec that IS the product, drops one that is a variant", () => {
    // "4K" is what distinguishes the monitor; "512GB" is which one you bought.
    expect(deriveCatalogTerm("4K Gaming Monitor 27 inch")).toContain("4K");
    expect(deriveCatalogTerm("Galaxy S24 Ultra 512GB", "Samsung")).not.toContain("512GB");
  });

  it("never grows past four words", () => {
    const term = deriveCatalogTerm(
      "Logitech MX Master 3S Performance Wireless Mouse for Mac and Windows",
      "Logitech",
    );
    expect(term!.split(" ").length).toBeLessThanOrEqual(4);
  });

  it("returns null rather than spend a vendor call on nothing", () => {
    expect(deriveCatalogTerm(null)).toBeNull();
    expect(deriveCatalogTerm("")).toBeNull();
    expect(deriveCatalogTerm("   ")).toBeNull();
    // Pure variant noise: no product left once it is cut.
    expect(deriveCatalogTerm("Black White Blue")).toBeNull();
    // A single short token describes nothing.
    expect(deriveCatalogTerm("Pro")).toBeNull();
  });

  it("survives a title that is only punctuation or emoji", () => {
    expect(deriveCatalogTerm("★★★ !!! ★★★")).toBeNull();
    expect(deriveCatalogTerm("🎧🎧🎧")).toBeNull();
  });

  it("normalises to something the unique index can dedupe", () => {
    // Migration 055 keys on (store, lower(collapsed whitespace)), so two sellers
    // writing the same product differently must land on one row.
    const a = deriveCatalogTerm("Apple  AirPods   Pro", "Apple");
    const b = deriveCatalogTerm("Apple AirPods Pro", "Apple");
    expect(a?.toLowerCase().replace(/\s+/g, " ")).toBe(b?.toLowerCase().replace(/\s+/g, " "));
  });
});

describe("catalogStoreFor", () => {
  it("sends an eBay paste to eBay", () => {
    expect(catalogStoreFor("ebay")).toBe("ebay");
    expect(catalogStoreFor("eBay")).toBe("ebay");
  });

  it("sends everything else to Amazon, the larger catalogue", () => {
    // catalog_queries.store accepts only these two. A Walmart paste still earns
    // the customer similar products, they just come from Amazon.
    expect(catalogStoreFor("walmart")).toBe("amazon");
    expect(catalogStoreFor("amazon")).toBe("amazon");
    expect(catalogStoreFor(null)).toBe("amazon");
    expect(catalogStoreFor(undefined)).toBe("amazon");
  });
});
