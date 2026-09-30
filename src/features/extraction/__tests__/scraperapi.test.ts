import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixtures from "./fixtures/scraperapi.json";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: "sa-test-key" } },
}));

import { mapScraperApiAmazon, mapScraperApiEbay, normalizeCurrency, parseMoney, scraperApiResolver } from "../resolvers/scraperapi.resolver";
import { resolveProduct } from "../resolvers/chain";
import { emptyProduct, SupportedPlatform, getScraperByPlatform } from "../scrapers";
import { TomameCategory } from "@/config/categories";
import type { ExtractionResolver } from "../resolvers/types";
import { STORES } from "../stores";

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

describe("normalizeCurrency", () => {
  it("reduces eBay's scraped currency text to an ISO code", () => {
    expect(normalizeCurrency("US $or Best Offer", "USD")).toBe("USD"); // seen live 2026-09-12
    expect(normalizeCurrency("US $", "GBP")).toBe("USD");
    expect(normalizeCurrency("GBP", "USD")).toBe("GBP");
    expect(normalizeCurrency("£", "USD")).toBe("GBP");
    expect(normalizeCurrency("C $", "USD")).toBe("CAD");
    expect(normalizeCurrency("", "GBP")).toBe("GBP");
    expect(normalizeCurrency("whatever", "USD")).toBe("USD");
  });

  it("maps a live eBay listing whose currency field is polluted", () => {
    const p = mapScraperApiEbay({ title: "Apple AirPods Pro 2", price: { value: 1234, currency: "US $or Best Offer" }, available: true }, EBAY_URL);
    expect(p.price).toBe(1234);
    expect(p.currency).toBe("USD");
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

  it("promotes seller, rating, review count, images and availability to typed fields; condition stays null", () => {
    const p = mapScraperApiAmazon(fixtures.amazon, AMZ_URL);
    expect(p.seller).toBe("FlamakerDirect");
    expect(p.rating).toBe(4.4);
    expect(p.review_count).toBe(77891);
    expect(p.availability).toBe("In Stock");
    expect(p.condition).toBeNull(); // the Amazon record does not state it
    expect(p.images).toHaveLength(2);
    expect(p.images![0]).toBe(p.image);
    expect(p.variants).toEqual({});
    expect(p.metadata?.reviewCount).toBe("77891 reviews"); // legacy copy kept
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

  it("promotes seller, condition and images; availability is a boolean upstream so stays null", () => {
    const p = mapScraperApiEbay(fixtures.ebay, EBAY_URL);
    expect(p.seller).toBe("T4C LLC");
    expect(p.condition).toBe("Excellent - Refurbished");
    expect(p.images).toHaveLength(2);
    expect(p.images![0]).toBe(p.image);
    expect(p.availability).toBeNull();
    expect(p.rating).toBeNull();
    expect(p.review_count).toBeNull();
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
    store: STORES[0]!,
    signal: new AbortController().signal,
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

describe("ScraperAPI weight and dimensions (prod shapes, 2026-09-30)", () => {
  const LRM = "\u200E";
  const HANES_URL = "https://www.amazon.com/dp/B00JUM30SI";
  const hanes = {
    name: "Hanes Men's EcoSmart Hoodie",
    pricing: "$16.00",
    product_information: {
      asin: `${LRM}B096KSH2CB`,
      department: `${LRM}mens`,
      item_model_number: `${LRM}OP170`,
      product_dimensions: `${LRM}13 x 8 x 1 inches; 1.49 pounds`,
    },
  };

  it("Amazon: reads the weight from the dimensions string and strips U+200E", () => {
    const p = mapScraperApiAmazon(hanes, HANES_URL);
    expect(p.weight).toBe("1.49 pounds");
    expect(p.weight_lbs).toBe(1.49);
    expect(p.dimensions).toBe("13 x 8 x 1 inches; 1.49 pounds");
    expect(p.specifications?.["Asin"]).toBe("B096KSH2CB");
    expect(p.specifications?.["Department"]).toBe("mens");
  });

  it("Amazon: keeps the requested ASIN and flags the one ScraperAPI answered for", () => {
    const p = mapScraperApiAmazon(hanes, HANES_URL);
    expect(p.metadata?.asin).toBe("B00JUM30SI");
    expect(p.metadata?.returnedAsin).toBe("B096KSH2CB");
    expect(p.metadata?.asinMismatch).toBe(true);
    const same = mapScraperApiAmazon({ ...hanes, product_information: { ...hanes.product_information, asin: `${LRM}B00JUM30SI` } }, HANES_URL);
    expect(same.metadata?.asinMismatch).toBe(false);
  });

  it("Amazon: the resolver adds a message on an ASIN mismatch", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(hanes) });
    try {
      const r = await scraperApiResolver.resolve({
        url: HANES_URL,
        platform: SupportedPlatform.AMAZON,
        scraper: getScraperByPlatform(SupportedPlatform.AMAZON),
        region: "USA" as const,
        deadline: Date.now() + 30_000,
        store: STORES[0]!,
        signal: new AbortController().signal,
        getHtml: async () => null,
        htmlState: () => "unfetched" as const,
        current: emptyProduct(),
      });
      expect(r.messages?.some((m) => m.includes("B096KSH2CB"))).toBe(true);
      expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toContain("asin=B00JUM30SI");
    } finally {
      global.fetch = originalFetch;
    }
  });

  const macbook = (extra: Array<{ label: string; value: string }> = []) => ({
    title: "Apple MacBook Pro 16 2019",
    price: { value: 450, currency: "USD" },
    item_specifics: [
      { label: "Item Width", value: "14" },
      { label: "Item Height", value: "3" },
      { label: "Item Length", value: "18" },
      { label: "Item Weight", value: "4" },
      { label: "Screen Size", value: '16"' },
      ...extra,
    ],
  });

  it("eBay: a unitless weight is kept as text, not assumed to be pounds", () => {
    const p = mapScraperApiEbay(macbook(), "https://www.ebay.com/itm/298105190066");
    expect(p.weight).toBe("4");
    expect(p.weight_lbs).toBeNull();
  });

  it("eBay: a Weight Unit spec makes the bare number usable", () => {
    const p = mapScraperApiEbay(macbook([{ label: "Weight Unit", value: "lbs" }]), "https://www.ebay.com/itm/298105190066");
    expect(p.weight_lbs).toBe(4);
  });

  it("eBay: seller-written units", () => {
    const withWeight = (value: string) =>
      mapScraperApiEbay({ title: "x", item_specifics: [{ label: "Item Weight", value }] }, "https://www.ebay.com/itm/1").weight_lbs;
    expect(withWeight("12 oz")).toBe(0.75);
    expect(withWeight("500 g")).toBe(1.1);
    expect(withWeight("1.2 kg")).toBe(2.65);
    expect(withWeight("2 lbs 4 oz")).toBe(2.25);
  });

  it("eBay: combines Item Length / Width / Height instead of keeping one number", () => {
    const p = mapScraperApiEbay(macbook(), "https://www.ebay.com/itm/298105190066");
    expect(p.dimensions).toBe("18 x 14 x 3");
  });
});
