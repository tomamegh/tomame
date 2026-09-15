import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { extraction: { scraperApiKey: "test-key" } } }));

import amazonFixture from "./fixtures/scraperapi-amazon-search.json";
import ebayFixture from "./fixtures/scraperapi-ebay-search.json";
import ebayConcatenatedFixture from "./fixtures/scraperapi-ebay-search-concatenated.json";
import { hashUrl } from "@/features/extraction/url";
import {
  fetchCatalogSearch,
  mapAmazonSearchResults,
  mapEbaySearchResults,
  type ScraperApiAmazonSearchResult,
  type ScraperApiEbaySearchResult,
} from "../services/scraperapi-search";

const ctx = { queryId: "q-1", category: "Headphones" };

describe("mapAmazonSearchResults", () => {
  const results = amazonFixture.results as ScraperApiAmazonSearchResult[];

  it("maps the live response shape: asin, canonical /dp/ URL, numeric price, stars, reviews", () => {
    const items = mapAmazonSearchResults(results, ctx);
    expect(items).toHaveLength(4);
    const first = items.find((i) => i.external_id === "B0HCXW6CDR")!;
    expect(first.store).toBe("amazon");
    expect(first.product_url).toBe("https://www.amazon.com/dp/B0HCXW6CDR");
    expect(first.url_hash).toBe(hashUrl("https://www.amazon.com/dp/B0HCXW6CDR"));
    expect(first.price_usd).toBe(19.99);
    expect(first.currency).toBe("USD");
    expect(first.rating).toBe(4.9);
    expect(first.review_count).toBe(676);
    expect(first.image_url).toMatch(/^https:\/\/m\.media-amazon\.com\//);
    expect(first.category).toBe("Headphones");
    expect(first.query_id).toBe("q-1");
  });

  it("keeps a listing with no price as a null-priced row rather than inventing one", () => {
    const items = mapAmazonSearchResults(results, ctx);
    const priceless = items.find((i) => i.external_id === "B0DN45YMP6")!;
    expect(priceless).toBeDefined();
    expect(priceless.price_usd).toBeNull();
  });

  it("drops rows with no title or a malformed ASIN and de-duplicates by ASIN", () => {
    const items = mapAmazonSearchResults(
      [
        { asin: "B0HCXW6CDR", name: "A", price: 1 },
        { asin: "B0HCXW6CDR", name: "A again", price: 2 },
        { asin: "bad", name: "B", price: 3 },
        { asin: "B0HBWW3958", name: "   ", price: 4 },
      ],
      ctx,
    );
    expect(items.map((i) => i.external_id)).toEqual(["B0HCXW6CDR"]);
  });
});

describe("mapEbaySearchResults", () => {
  const results = ebayFixture.results as ScraperApiEbaySearchResult[];

  it("maps the live v2 shape: item id from /itm/, canonical URL, { value, currency } price", () => {
    const items = mapEbaySearchResults(results, ctx);
    const first = items.find((i) => i.external_id === "227354086920")!;
    expect(first.store).toBe("ebay");
    expect(first.product_url).toBe("https://www.ebay.com/itm/227354086920");
    expect(first.url_hash).toBe(hashUrl("https://www.ebay.com/itm/227354086920"));
    expect(first.price_usd).toBe(229.99);
    expect(first.currency).toBe("USD");
    // Search rows carry the seller's rating, not the product's — never invented.
    expect(first.rating).toBeNull();
    expect(first.review_count).toBeNull();
  });

  it("uses the low end of a { from, to } variant range", () => {
    const items = mapEbaySearchResults(results, ctx);
    const range = items.find((i) => i.external_id === "286552363469")!;
    expect(range.price_usd).toBe(14.41);
    expect(range.currency).toBe("USD");
  });

  it("drops rows with a blank title", () => {
    const items = mapEbaySearchResults(results, ctx);
    expect(items.some((i) => i.product_url.endsWith("/itm/1"))).toBe(false);
    expect(items).toHaveLength(4);
  });

  // ScraperAPI occasionally collapses a whole results block into one row: the
  // title is a dozen listings run together and the price is their prices
  // concatenated into one 39-digit number. One reached the catalogue as a
  // "GH₵1,995,202,244,743,568,400,000,… delivered to your door" deal.
  describe("concatenated vendor rows", () => {
    const bad = ebayConcatenatedFixture.results as ScraperApiEbaySearchResult[];

    it("rejects every concatenated row in the live fixture and keeps the sound one", () => {
      const items = mapEbaySearchResults(bad, ctx);
      expect(items.map((i) => i.external_id)).toEqual(["335099887766"]);
      expect(items[0]!.price_usd).toBe(289.99);
    });

    it("rejects on the price tell: a title under eBay's 80-character limit but an absurd price", () => {
      const items = mapEbaySearchResults([{ product_title: "Fossil Juliana HR Smartwatch", product_url: "https://www.ebay.com/itm/407192567612", item_price: { value: 16508506.5, currency: "USD" } }], ctx);
      expect(items).toEqual([]);
    });

    it("rejects on the title tell alone — a concatenated row can carry no price at all", () => {
      const overlong = "Apple iPhone 5c".repeat(30);
      const items = mapEbaySearchResults([{ product_title: overlong, product_url: "https://www.ebay.com/itm/205123456789" }], ctx);
      expect(items).toEqual([]);
    });

    it("keeps a sound listing sitting exactly on eBay's 80-character title limit", () => {
      const title = "A".repeat(80);
      const items = mapEbaySearchResults([{ product_title: title, product_url: "https://www.ebay.com/itm/335099887766", item_price: { value: 99.5, currency: "USD" } }], ctx);
      expect(items.map((i) => i.title)).toEqual([title]);
    });

    it("keeps a genuinely expensive listing under the plausibility bound", () => {
      const items = mapEbaySearchResults([{ product_title: "Rolex Daytona 116500LN Panda Dial Stainless Steel Watch Box & Papers 2023", product_url: "https://www.ebay.com/itm/335099887767", item_price: { value: 38500, currency: "USD" } }], ctx);
      expect(items.map((i) => i.price_usd)).toEqual([38500]);
    });
  });
});

describe("fetchCatalogSearch", () => {
  it("calls the Amazon search endpoint with country_code + tld and maps the results", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(amazonFixture), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const out = await fetchCatalogSearch("amazon", "wireless earbuds", ctx);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://api.scraperapi.com/structured/amazon/search");
    expect(url.searchParams.get("query")).toBe("wireless earbuds");
    expect(url.searchParams.get("country_code")).toBe("us");
    expect(url.searchParams.get("tld")).toBe("com");
    expect(out.rawCount).toBe(4);
    expect(out.items).toHaveLength(4);
    fetchMock.mockRestore();
  });

  it("uses the eBay v2 path and throws on a non-2xx (the credit is still counted by the caller)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("quota", { status: 403 }));
    await expect(fetchCatalogSearch("ebay", "laptop", ctx)).rejects.toThrow(/HTTP 403/);
    expect(fetchMock.mock.calls[0]![0]).toContain("/structured/ebay/search/v2?");
    fetchMock.mockRestore();
  });
});
