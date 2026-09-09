import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: "rf-test-key" } },
}));

import { mapRainforestProduct, rainforestResolver } from "../resolvers/rainforest.resolver";
import { emptyProduct, SupportedPlatform, getScraperByPlatform } from "../scrapers";
import { TomameCategory } from "@/config/categories";

const HOMALL = {
  request_info: { success: true, credits_used: 1, credits_remaining: 99 },
  product: {
    asin: "B01MRZ02TL",
    title: "Homall Gaming Chair, Ergonomic Faux Leather High Back Office Chair, White",
    brand: "Homall",
    main_image: { link: "https://m.media-amazon.com/images/I/homall.jpg" },
    images: [{ link: "https://m.media-amazon.com/images/I/homall.jpg" }, { link: "https://m.media-amazon.com/images/I/homall2.jpg" }],
    categories: [{ name: "Home & Kitchen" }, { name: "Furniture" }, { name: "Gaming Chairs" }],
    specifications: [
      { name: "Brand", value: "Homall" },
      { name: "Item Weight", value: "36.2 pounds" },
      { name: "Product Dimensions", value: '19.8"D x 20.5"W x 47.8"H' },
    ],
    weight: "36.2 pounds",
    dimensions: '19.8"D x 20.5"W x 47.8"H',
    feature_bullets: ["COMFORT THAT HOLDS UP", "BUILT WITH THE MONEY WHERE IT COUNTS"],
    rating: 4.3,
    ratings_total: 51234,
    buybox_winner: {
      price: { symbol: "$", value: 80.74, currency: "USD", raw: "$80.74" },
      rrp: { value: 129.99, currency: "USD" },
      is_prime: true,
      availability: { type: "in_stock", raw: "In Stock" },
      condition: { is_new: true },
    },
  },
};

describe("mapRainforestProduct", () => {
  it("maps the fields pricing needs, in pounds", () => {
    const p = mapRainforestProduct(HOMALL.product);
    expect(p.title).toContain("Homall Gaming Chair");
    expect(p.price).toBe(80.74);
    expect(p.currency).toBe("USD");
    expect(p.brand).toBe("Homall");
    expect(p.category).toBe(TomameCategory.HOME_KITCHEN);
    expect(p.weight_lbs).toBe(36.2);
    expect(p.dimensions).toContain("47.8");
    expect(p.image).toBe("https://m.media-amazon.com/images/I/homall.jpg");
    expect(p.metadata?.listPrice).toBe(129.99);
    expect(p.metadata?.condition).toBe("New");
  });

  it("leaves price null when there is no buybox offer", () => {
    const p = mapRainforestProduct({ ...HOMALL.product, buybox_winner: undefined });
    expect(p.price).toBeNull();
    expect(p.currency).toBeNull();
  });
});

describe("rainforestResolver", () => {
  const originalFetch = global.fetch;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const ctx = (url: string, platform = SupportedPlatform.AMAZON) => ({
    url,
    platform,
    scraper: getScraperByPlatform(platform),
    region: "USA" as const,
    deadline: Date.now() + 30_000,
    getHtml: async () => null,
    current: emptyProduct(),
  });

  it("is only available for Amazon", () => {
    expect(rainforestResolver.available(ctx("https://www.amazon.com/dp/B01MRZ02TL"))).toBe(true);
    expect(rainforestResolver.available(ctx("https://www.ebay.com/itm/123456789012", SupportedPlatform.EBAY))).toBe(false);
  });

  it("requests by ASIN and amazon_domain and never touches the page HTML", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(HOMALL) });
    const getHtml = vi.fn(async () => null);
    const result = await rainforestResolver.resolve({ ...ctx("https://www.amazon.co.uk/dp/B01MRZ02TL"), getHtml });

    const calledUrl = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(calledUrl).toContain("asin=B01MRZ02TL");
    expect(calledUrl).toContain("amazon_domain=amazon.co.uk");
    expect(calledUrl).toContain("type=product");
    expect(getHtml).not.toHaveBeenCalled();
    expect(result.product.price).toBe(80.74);
  });

  it("returns an empty partial (never throws) on API failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 402, text: () => Promise.resolve("credits exhausted") });
    const result = await rainforestResolver.resolve(ctx("https://www.amazon.com/dp/B01MRZ02TL"));
    expect(result.product).toEqual({});
  });
});
