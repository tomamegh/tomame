import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { extraction: { scraperApiKey: "test-key", zyteApiKey: "zyte-key" } } }));

import walmartFixture from "./fixtures/scraperapi-walmart-search.json";
import etsyFixture from "./fixtures/zyte-etsy-product-list.json";
import nikeFixture from "./fixtures/zyte-nike-product-list.json";
import { hashUrl } from "@/features/extraction/url";
import { findStore } from "@/features/extraction/stores";
import { walmartProductIdOf } from "@/features/extraction/resolvers/oxylabs.resolver";
import {
  fetchCatalogSearch,
  mapWalmartSearchResults,
  walmartItemIdOf,
  type ScraperApiWalmartSearchResult,
} from "../services/scraperapi-search";
import { canonicalZyteListing, mapZyteProductList, zyteSearchUrl } from "../services/zyte-search";
import { searchableCatalogStores } from "../services/catalog-vendors";
import { effectiveMonthlyCap, isProductionDeployment } from "@/config/catalog";
import type { ZyteProductFromList } from "@/lib/zyte/client";

const ctx = { queryId: "q-1", category: "Office Products" };

describe("mapWalmartSearchResults (live response, 2026-09-30)", () => {
  const items = mapWalmartSearchResults(walmartFixture.items as ScraperApiWalmartSearchResult[], ctx);

  it("maps every row to the canonical /ip/<item id> URL the ordering path reads", () => {
    expect(items.length).toBeGreaterThanOrEqual(4);
    const first = items[0]!;
    expect(first).toMatchObject({
      store: "walmart",
      external_id: "108684613",
      product_url: "https://www.walmart.com/ip/108684613",
      url_hash: hashUrl("https://www.walmart.com/ip/108684613"),
      title: "BestOffice Ergonomic Home Office Chair, Adjustable Lumbar Support and Height, with Arms, Black",
      price_usd: 39.99,
      currency: "USD",
      rating: 4.3,
      review_count: 7452,
      category: "Office Products",
      query_id: "q-1",
    });
    for (const it of items) {
      // The paste flow reads exactly this URL: the store registry knows it and Oxylabs finds its id.
      expect(findStore(it.product_url)?.slug).toBe("walmart");
      expect(walmartProductIdOf(it.product_url)).toBe(it.external_id);
    }
  });

  it("stores the full-size image, not the 180px search thumbnail", () => {
    expect(items[0]!.image_url).toMatch(/^https:\/\/i5\.walmartimages\.com\/seo\/.+\.jpeg$/);
  });

  it("keeps brand and seller in raw, drops the sibling variants", () => {
    expect(items[0]!.raw).toMatchObject({ brand: "BestOffice", seller: "Factory Direct Wholesales, LLC" });
    for (const it of items) expect(it.raw?.variants).toBeUndefined();
  });

  it("drops a row with no item id, and stores no price for an out-of-stock row", () => {
    const out = mapWalmartSearchResults(
      [
        { name: "No id", url: "https://www.walmart.com/browse/electronics", price: 10 },
        { name: "Gone", url: "https://www.walmart.com/ip/Gone/123456789", price: 25, availability: "Out of stock" },
      ],
      ctx,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ external_id: "123456789", price_usd: null, currency: null });
  });

  it("reads the item id with or without a slug", () => {
    expect(walmartItemIdOf("https://www.walmart.com/ip/Foo-Bar/17120159941?classType=VARIANT")).toBe("17120159941");
    expect(walmartItemIdOf("https://www.walmart.com/ip/33707529")).toBe("33707529");
    expect(walmartItemIdOf("https://www.walmart.com/search?q=chair")).toBeNull();
  });

  it("calls walmart/search and reads the `items` envelope", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(walmartFixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await fetchCatalogSearch("walmart", "office chair", ctx);
      const calledUrl = String((fetchMock.mock.calls[0] as unknown[])[0]);
      expect(calledUrl).toMatch(/^https:\/\/api\.scraperapi\.com\/structured\/walmart\/search\?/);
      expect(calledUrl).toContain("query=office+chair");
      expect(res.rawCount).toBe(walmartFixture.items.length);
      expect(res.items.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("mapZyteProductList (live responses, 2026-09-30)", () => {
  it("Etsy: canonical /listing/<id>, string prices parsed, tracking dropped", () => {
    const items = mapZyteProductList("etsy", etsyFixture.productList.products as ZyteProductFromList[], ctx);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      store: "etsy",
      external_id: "1384498535",
      product_url: "https://www.etsy.com/listing/1384498535",
      price_usd: 34.98,
      currency: "USD",
      rating: null,
      review_count: null,
    });
    expect(items[0]!.image_url).toMatch(/^https:\/\/i\.etsystatic\.com\//);
    expect(items[0]!.raw).toMatchObject({ regularPrice: "58.3" });
    for (const it of items) expect(findStore(it.product_url)?.slug).toBe("etsy");
  });

  it("Nike: canonical /t/<slug>/<STYLE>, one row per style code", () => {
    const items = mapZyteProductList("nike", nikeFixture.productList.products as ZyteProductFromList[], ctx);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      store: "nike",
      external_id: "IM2541-600",
      product_url: "https://www.nike.com/t/pegasus-plus-2-mens-road-running-shoes-p9ePl101/IM2541-600",
      price_usd: 170,
    });
    for (const it of items) expect(findStore(it.product_url)?.slug).toBe("nike");
  });

  it("drops cards that are not product pages or not on the store", () => {
    expect(canonicalZyteListing("etsy", "https://www.etsy.com/shop/SomeShop")).toBeNull();
    expect(canonicalZyteListing("etsy", "http://www.etsy.com/listing/1/x")).toBeNull();
    expect(canonicalZyteListing("nike", "https://www.nike.com/w/mens-shoes-nik1zy7ok")).toBeNull();
    expect(canonicalZyteListing("nike", "https://evil.example/t/x/AB1234-001")).toBeNull();
  });

  it("builds the store's own search URL", () => {
    expect(zyteSearchUrl("etsy", "leather wallet")).toBe("https://www.etsy.com/search?q=leather+wallet");
    expect(zyteSearchUrl("nike", "air force 1")).toBe("https://www.nike.com/w?q=air+force+1");
  });
});

describe("searchableCatalogStores", () => {
  it("offers a store only when its vendor has a key", () => {
    expect(searchableCatalogStores({ scraperapi: true, zyte: true })).toEqual(["amazon", "ebay", "walmart", "etsy", "nike"]);
    expect(searchableCatalogStores({ scraperapi: true, zyte: false })).toEqual(["amazon", "ebay", "walmart"]);
    expect(searchableCatalogStores({ scraperapi: false, zyte: false })).toEqual([]);
  });
});

describe("per-deployment budget caps", () => {
  const caps = { production: 3000, other: 40 };

  it("production is tomame.ca only", () => {
    expect(isProductionDeployment("https://tomame.ca")).toBe(true);
    expect(isProductionDeployment("https://www.tomame.ca/")).toBe(true);
    expect(isProductionDeployment("https://dev.tomame.ca")).toBe(false);
    expect(isProductionDeployment("http://localhost:3000")).toBe(false);
    expect(isProductionDeployment(undefined)).toBe(false);
  });

  it("production honours the row the owner set; everywhere else is clamped to the small cap", () => {
    expect(effectiveMonthlyCap(caps, 5000, true)).toBe(5000);
    expect(effectiveMonthlyCap(caps, null, true)).toBe(3000);
    expect(effectiveMonthlyCap(caps, 500, false)).toBe(40);
    expect(effectiveMonthlyCap(caps, 10, false)).toBe(10);
  });
});
