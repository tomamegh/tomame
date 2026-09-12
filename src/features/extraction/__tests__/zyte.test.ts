import { describe, it, expect, vi } from "vitest";
import fixtures from "./fixtures/zyte.json";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: null, oxylabsUsername: null, oxylabsPassword: null, zyteApiKey: "z" } },
}));

import { mapZyteProduct, zyteResolver } from "../resolvers/zyte.resolver";
import type { ZyteProduct } from "@/lib/zyte/client";

const f = fixtures as unknown as Record<string, ZyteProduct>;

describe("mapZyteProduct (real response shapes)", () => {
  it("Amazon: price, currency, brand, images", () => {
    const p = mapZyteProduct(f.amazon!, "USD");
    expect(p.title).toBe("Apple iPhone 15 Plus Clear Case with MagSafe");
    expect(p.price).toBe(12.99);
    expect(p.currency).toBe("USD");
    expect(p.brand).toBe("Apple");
    expect(p.metadata?.listPrice).toBe(49);
    expect(p.image).toMatch(/^https:/);
  });

  it("SHEIN: breadcrumbs, size, colour, variant", () => {
    const p = mapZyteProduct(f.shein!, "USD");
    expect(p.price).toBe(73);
    expect(p.size).toBe("M");
    expect(p.metadata?.variant).toBe("Light Blue · M · Sexy"); // colour · size · style, as Zyte reports them
    expect(p.metadata?.breadcrumbs).toContain("Women Dresses");
  });

  it("Walmart out of stock: regularPrice is never quoted as the price", () => {
    const p = mapZyteProduct(f.walmart!, "USD");
    expect(p.price).toBeNull();
    expect(p.currency).toBeNull();
    expect(p.brand).toBe("Samsung"); // "Visit the Samsung Store" cleaned
    expect(p.metadata?.listPrice).toBe(3109);
  });

  it("Nike: falls back to the store currency when Zyte gives a symbol", () => {
    const p = mapZyteProduct({ ...f.nike!, currency: undefined, currencyRaw: "$" }, "GBP");
    expect(p.price).toBe(115);
    expect(p.currency).toBe("USD");
  });

  it("typed facts: aggregateRating, availability token, images and sibling variants", () => {
    const amazon = mapZyteProduct(f.amazon!, "USD");
    expect(amazon.rating).toBe(4.3);
    expect(amazon.review_count).toBe(321);
    expect(amazon.availability).toBe("In Stock");
    expect(amazon.variants!.color).toEqual(expect.arrayContaining(["Black", "Clay", "Light Pink"]));
    expect(amazon.images![0]).toBe(amazon.image);
    expect(amazon.seller).toBeNull();
    expect(amazon.condition).toBeNull();

    const shein = mapZyteProduct(f.shein!, "USD");
    expect(shein.variants!.size).toEqual(["S", "M", "L", "XL", "XXL", "XXXL"]);
    expect(shein.availability).toBe("Out of Stock");
  });

  it("typed facts: Walmart's price/stock-polluted variant strings are not options", () => {
    const p = mapZyteProduct(f.walmart!, "USD");
    expect(p.variants).toEqual({ color: ["Gray", "Violet", "Yellow"] }); // the ", was $…, Out of stock" twins are dropped
    expect(p.availability).toBe("Out of Stock");
    expect(p.rating).toBeNull();
  });

  it("Etsy: complete", () => {
    const p = mapZyteProduct(f.etsy!, "USD");
    expect(p.title).toContain("Cortez");
    expect(p.price).toBe(55);
    expect(p.brand).toBe("LocalLeatherShop");
  });
});

describe("zyteResolver", () => {
  it("runs for any store while the listing is unknown", () => {
    const ctx = (current: Record<string, unknown>) => ({ platform: "nike", current: { title: null, price: null, currency: null, ...current } }) as never;
    expect(zyteResolver.available(ctx({}))).toBe(true);
    expect(zyteResolver.shouldRun(ctx({}))).toBe(true);
    expect(zyteResolver.shouldRun(ctx({ title: "T", price: 1, currency: "USD" }))).toBe(false);
  });
});
