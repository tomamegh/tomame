import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixtures from "./fixtures/scraperapi.json";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: "sa-test-key" } },
}));

import { mapScraperApiAmazon, mapScraperApiEbay, parseMoney, scraperApiResolver } from "../resolvers/scraperapi.resolver";
import { resolveProduct } from "../resolvers/chain";
import { emptyProduct, SupportedPlatform, getScraperByPlatform } from "../scrapers";
import { TomameCategory } from "@/config/categories";
import type { ExtractionResolver } from "../resolvers/types";

const AMZ_URL = "https://www.amazon.com/dp/B01MRZ02TL";
const EBAY_URL = "https://www.ebay.com/itm/407064013193?_trkparms=x";

describe("parseMoney", () => {
  it("reads symbol and thousands", () => {
    expect(parseMoney("$80.74", "USD")).toEqual({ price: 80.74, currency: "USD" });
    expect(parseMoney("£1,299.00", "USD")).toEqual({ price: 1299, currency: "GBP" });
    expect(parseMoney("129.99", "GBP")).toEqual({ price: 129.99, currency: "GBP" });
    expect(parseMoney(undefined, "USD")).toEqual({ price: null, currency: null });
  });
});

describe("mapScraperApiAmazon (real response shape)", () => {
  it("maps price, weight, category, brand and dimensions", () => {
    const p = mapScraperApiAmazon(fixtures.amazon, AMZ_URL);
    expect(p.title).toContain("Homall Gaming Chair");
    expect(p.price).toBe(80.74);
    expect(p.currency).toBe("USD");
    expect(p.brand).toBe("Homall"); // "Visit the Homall Store" cleaned
    expect(p.category).toBe(TomameCategory.HOME_KITCHEN);
    expect(p.weight).toBe("36.2 pounds");
    expect(p.weight_lbs).toBe(36.2);
    expect(p.dimensions).toContain("47.8");
    expect(p.image).toMatch(/^https:\/\/m\.media-amazon\.com/);
    expect(p.metadata?.listPrice).toBe(129.99);
  });
});

describe("mapScraperApiEbay (real response shape)", () => {
  it("maps price object, condition, brand and specifics", () => {
    const p = mapScraperApiEbay(fixtures.ebay, EBAY_URL);
    expect(p.title).toContain("iPhone 17 Pro");
    expect(p.price).toBe(949.99);
    expect(p.currency).toBe("USD");
    expect(p.brand).toBe("Apple");
    expect(p.metadata?.condition).toContain("Refurbished");
    expect(p.metadata?.itemId).toBe("407064013193");
    expect(p.specifications?.["Storage Capacity"]).toBeDefined();
    expect(p.specifications?.["Seller Notes"]).toBeUndefined();
    expect(p.category).toBeNull(); // eBay endpoint has no category path
  });
});

describe("scraperApiResolver", () => {
  const originalFetch = global.fetch;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const ctx = (url: string, platform: SupportedPlatform) => ({
    url,
    platform,
    scraper: getScraperByPlatform(platform),
    region: "USA" as const,
    deadline: Date.now() + 30_000,
    getHtml: async () => null,
    htmlState: () => "unfetched" as const,
    current: emptyProduct(),
  });

  it("is available for Amazon and eBay only", () => {
    expect(scraperApiResolver.available(ctx(AMZ_URL, SupportedPlatform.AMAZON))).toBe(true);
    expect(scraperApiResolver.available(ctx(EBAY_URL, SupportedPlatform.EBAY))).toBe(true);
    expect(scraperApiResolver.available(ctx("https://us.shein.com/x-p-1.html", SupportedPlatform.SHEIN))).toBe(false);
  });

  it("calls the eBay structured endpoint with the item id", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fixtures.ebay) });
    const r = await scraperApiResolver.resolve(ctx(EBAY_URL, SupportedPlatform.EBAY));
    const url = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(url).toContain("/structured/ebay/product?");
    expect(url).toContain("product_id=407064013193");
    expect(r.product.price).toBe(949.99);
  });

  it("calls the Amazon structured endpoint with asin, tld and country", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fixtures.amazon) });
    await scraperApiResolver.resolve(ctx("https://www.amazon.co.uk/dp/B01MRZ02TL", SupportedPlatform.AMAZON));
    const url = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(url).toContain("asin=B01MRZ02TL");
    expect(url).toContain("tld=co.uk");
    expect(url).toContain("country=uk");
  });
});

describe("fast mode with a structured tier", () => {
  it("does not launch the browser for nice-to-haves once the listing is known", async () => {
    const fetchHtml = vi.fn(async () => ({ html: "<html/>", source: "browserless" as const }));
    const structured: ExtractionResolver = {
      name: "scraperapi", defaultConfidence: 0.95, needsHtml: false, available: () => true, shouldRun: () => true,
      resolve: async () => ({ product: { title: "Chair", price: 80.74, currency: "USD", category: TomameCategory.HOME_KITCHEN } }),
    };
    const parser: ExtractionResolver = {
      name: "platform-html", defaultConfidence: 0.9, needsHtml: true, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => ((await ctx.getHtml()) ? { product: { weight_lbs: 36 } } : { product: {} }),
    };
    const out = await resolveProduct({
      url: AMZ_URL, platform: SupportedPlatform.AMAZON, region: "USA", resolvers: [structured, parser], fetchHtml, stopWhenRequired: true,
    });
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(out.ran).toEqual(["scraperapi"]);
    expect(out.skipped).toEqual(["platform-html"]);
    expect(out.product.price).toBe(80.74);
  });

  it("stops after the LLM had its say on category when the structured tier has none", async () => {
    const structured: ExtractionResolver = {
      name: "scraperapi", defaultConfidence: 0.95, needsHtml: false, available: () => true, shouldRun: () => true,
      resolve: async () => ({ product: { title: "Phone", price: 949.99, currency: "USD" } }),
    };
    const llm: ExtractionResolver = {
      name: "llm", defaultConfidence: 0.6, needsHtml: false, available: () => true, shouldRun: (c) => !c.current.category,
      resolve: async (c) => {
        expect(c.htmlState()).toBe("unfetched");
        return { product: { category: TomameCategory.CELL_PHONES } };
      },
    };
    const apify: ExtractionResolver = {
      name: "apify", defaultConfidence: 0.85, needsHtml: false, available: () => true, shouldRun: () => true,
      resolve: async () => ({ product: { title: "should not run" } }),
    };
    const out = await resolveProduct({
      url: EBAY_URL, platform: SupportedPlatform.EBAY, region: "USA", resolvers: [structured, llm, apify], fetchHtml: async () => null, stopWhenRequired: true,
    });
    expect(out.ran).toEqual(["scraperapi", "llm"]);
    expect(out.product.category).toBe(TomameCategory.CELL_PHONES);
    expect(out.product.title).toBe("Phone");
  });
});
