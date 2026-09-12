import { describe, it, expect, vi } from "vitest";
import fixtures from "./fixtures/oxylabs.json";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: null, oxylabsUsername: "u", oxylabsPassword: "p", zyteApiKey: null } },
}));

import { mapOxylabsAmazon, mapOxylabsWalmart, walmartProductIdOf, oxylabsResolver } from "../resolvers/oxylabs.resolver";
import type { OxylabsAmazonProduct, OxylabsWalmartProduct } from "@/lib/oxylabs/client";

describe("walmartProductIdOf", () => {
  it("reads both URL shapes", () => {
    expect(walmartProductIdOf("https://www.walmart.com/ip/5253396052")).toBe("5253396052");
    expect(walmartProductIdOf("https://www.walmart.com/ip/AT-T-Samsung-Galaxy-S24/5253396052?athcpid=x")).toBe("5253396052");
    expect(walmartProductIdOf("https://www.walmart.com/browse/electronics")).toBeNull();
  });
});

describe("mapOxylabsAmazon (real response shape)", () => {
  it("maps price, weight, breadcrumbs, brand, dimensions", () => {
    const p = mapOxylabsAmazon(fixtures.amazon as unknown as OxylabsAmazonProduct, "https://www.amazon.com/dp/B0CHX3QBCH");
    expect(p.title).toBe("Apple iPhone 15 Plus Clear Case with MagSafe");
    expect(p.price).toBe(12.99);
    expect(p.currency).toBe("USD");
    expect(p.brand).toBe("Apple");
    expect(p.weight).toBe("2.46 ounces");
    expect(p.weight_lbs).toBeCloseTo(0.154, 2);
    expect(p.dimensions).toContain("6.89");
    expect(p.image).toMatch(/^https:\/\/m\.media-amazon\.com/);
    expect(p.metadata?.breadcrumbs).toEqual(["Cell Phones & Accessories", "Cases, Holsters & Sleeves", "Basic Cases"]);
    expect(p.metadata?.listPrice).toBe(49);
    expect(p.specifications?.["Item Weight"]).toBe("2.46 ounces");
  });

  it("promotes seller, rating, review count, availability, images and sibling variants", () => {
    const p = mapOxylabsAmazon(fixtures.amazon as unknown as OxylabsAmazonProduct, "https://www.amazon.com/dp/B0CHX3QBCH");
    expect(p.seller).toBe("iDeals Today");
    expect(p.rating).toBe(4.3);
    expect(p.review_count).toBe(321);
    expect(p.availability).toBe("In Stock");
    expect(p.condition).toBeNull();
    expect(p.images![0]).toBe(p.image);
    expect(p.variants!.color).toEqual(expect.arrayContaining(["Black", "Light Pink"]));
    expect(p.variants!.material_type).toEqual(expect.arrayContaining(["Fabric", "Silicone"]));
  });
});

describe("mapOxylabsWalmart (real response shape)", () => {
  it("does not quote a strike-through price for an out-of-stock item", () => {
    const p = mapOxylabsWalmart(fixtures.walmart as unknown as OxylabsWalmartProduct, "https://www.walmart.com/ip/5253396052");
    expect(p.title).toContain("Samsung Galaxy S24 Ultra");
    expect(p.price).toBeNull();
    expect(p.currency).toBeNull();
    expect(p.brand).toBe("Samsung");
    expect((p.metadata?.breadcrumbs as string[])[0]).toBe("Cell Phones");
    expect(p.metadata?.availability).toBe("Out of stock");
    expect(p.specifications?.["Screen size"]).toBe("6.8 in");
  });

  it("typed facts: a 0-star average over 0 reviews is not a rating; out-of-stock variations are not options", () => {
    const p = mapOxylabsWalmart(fixtures.walmart as unknown as OxylabsWalmartProduct, "https://www.walmart.com/ip/5253396052");
    expect(p.seller).toBe("Walmart.com");
    expect(p.rating).toBeNull();
    expect(p.review_count).toBe(0);
    expect(p.availability).toBe("Out of stock");
    expect(p.variants).toEqual({});
    expect(p.images![0]).toBe(p.image);
  });

  it("typed facts: in-stock variations become options keyed by attribute", () => {
    const item = {
      ...(fixtures.walmart as unknown as OxylabsWalmartProduct),
      rating: { rating: 4.1, count: 12 },
      fulfillment: { out_of_stock: false },
      variations: [
        { selected_options: [{ key: "Color", value: "Titanium Gray" }, { key: "Capacity", value: "256GB" }], state: "IN_STOCK" },
        { selected_options: [{ key: "Color", value: "Titanium Violet" }], state: "OUT_OF_STOCK" },
      ],
    };
    const p = mapOxylabsWalmart(item, "https://www.walmart.com/ip/5253396052");
    expect(p.rating).toBe(4.1);
    expect(p.review_count).toBe(12);
    expect(p.availability).toBe("In stock");
    expect(p.variants).toEqual({ color: ["Titanium Gray"], capacity: ["256GB"] });
  });

  it("maps a live price", () => {
    const item = { ...(fixtures.walmart as unknown as OxylabsWalmartProduct), price: { price: 899, currency: "USD" }, fulfillment: { out_of_stock: false } };
    const p = mapOxylabsWalmart(item, "https://www.walmart.com/ip/5253396052");
    expect(p.price).toBe(899);
    expect(p.currency).toBe("USD");
  });
});

describe("oxylabsResolver", () => {
  const ctx = (platform: string, current: Record<string, unknown> = {}) =>
    ({ platform, url: "https://x", current: { title: null, price: null, currency: null, ...current }, deadline: Date.now() + 10_000 }) as never;

  it("is available for Amazon and Walmart only, and only while the listing is unknown", () => {
    expect(oxylabsResolver.available(ctx("amazon"))).toBe(true);
    expect(oxylabsResolver.available(ctx("walmart"))).toBe(true);
    expect(oxylabsResolver.available(ctx("ebay"))).toBe(false);
    expect(oxylabsResolver.shouldRun(ctx("amazon"))).toBe(true);
    expect(oxylabsResolver.shouldRun(ctx("amazon", { title: "T", price: 1, currency: "USD" }))).toBe(false);
    expect(oxylabsResolver.startAfterMs).toBeGreaterThan(0);
  });
});
