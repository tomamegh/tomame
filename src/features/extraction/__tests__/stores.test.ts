import { describe, it, expect } from "vitest";
import { findStore, storeForUrl, isPublicHostname, liveStoreNames, GENERIC_STORE_SLUG } from "../stores";
import { getScraperForStore, resolvePlatform, SUPPORTED_STORE_NAMES } from "../scrapers";
import { regionForUrl } from "../url";

describe("store registry", () => {
  it("resolves registered stores, subdomains included", () => {
    expect(findStore("https://www.walmart.com/ip/5253396052")?.slug).toBe("walmart");
    expect(findStore("https://smile.amazon.com/dp/B0CHX3QBCH")?.slug).toBe("amazon");
    expect(findStore("https://www.amazon.co.uk/dp/B0CHX3QBCH")?.region).toBe("UK");
    expect(findStore("https://us.shein.com/x-p-1.html")?.region).toBe("CHINA");
    expect(regionForUrl("https://www.etsy.com/listing/1857958157/x")).toBe("USA");
  });

  it("falls back to the generic store for any public host, never for private ones", () => {
    expect(storeForUrl("https://shop.example-boutique.com/products/hat")?.slug).toBe(GENERIC_STORE_SLUG);
    expect(storeForUrl("https://shop.example-boutique.com/products/hat")?.region).toBeNull();
    expect(storeForUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(storeForUrl("http://localhost:3000/x")).toBeNull();
    expect(storeForUrl("http://intranet.local/x")).toBeNull();
    expect(storeForUrl("https://[::1]/x")).toBeNull();
    expect(isPublicHostname("www.nike.com")).toBe(true);
  });

  it("resolvePlatform returns the slug for known stores and generic otherwise", () => {
    expect(resolvePlatform("https://www.amazon.com/dp/B0DSVMVYPH")).toBe("amazon");
    expect(resolvePlatform("https://www.etsy.com/listing/12345")).toBe("etsy");
    expect(resolvePlatform("https://unknown-shop.io/p/1")).toBe(GENERIC_STORE_SLUG);
    expect(resolvePlatform("not a url")).toBeNull();
  });

  it("generic scrapers use the registry's product-path rule and never fetch directly", () => {
    const walmart = getScraperForStore(findStore("https://www.walmart.com/ip/1")!);
    expect(walmart.isProductUrl("https://www.walmart.com/ip/Some-Phone/5253396052")).toBe(true);
    expect(walmart.isProductUrl("https://www.walmart.com/browse/electronics")).toBe(false);
    expect(walmart.htmlAttempts).not.toContain("direct");

    const generic = getScraperForStore(storeForUrl("https://unknown-shop.io/products/hat")!);
    expect(generic.isProductUrl("https://unknown-shop.io/products/hat")).toBe(true);
    expect(generic.isProductUrl("https://unknown-shop.io/")).toBe(false);
    expect(generic.isProductUrl("https://unknown-shop.io/search?q=hat")).toBe(false);
    expect(generic.htmlAttempts).toEqual(["zyte-browser"]);
  });

  it("advertises live stores once each", () => {
    expect(liveStoreNames()).toEqual(["Amazon", "eBay", "Walmart", "Etsy", "Nike"]);
    expect(SUPPORTED_STORE_NAMES).toEqual(liveStoreNames());
  });
});
