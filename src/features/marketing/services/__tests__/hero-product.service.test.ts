import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://x" }, extraction: {}, ebay: {} } }));
vi.mock("@/db/queries/catalog", () => ({ searchCatalogProducts: vi.fn() }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn(async () => ({})) }));
vi.mock("@/lib/ebay/config", () => ({ isEbayConfigured: () => true }));
vi.mock("@/lib/ebay/browse", () => ({ searchEbayItems: vi.fn() }));
vi.mock("@/features/extraction/hub-destination", () => ({ hubDestinationFor: vi.fn(async () => ({ country: "US", zip: "10001" })) }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ calculatePricing: vi.fn() }));
vi.mock("@/features/finder/services/finder-search.service", async () => {
  const shortlist = await import("@/features/finder/shortlist");
  void shortlist;
  return {
    listingFromCatalogHit: (h: { id: string; store: string; title: string; product_url: string; image_url: string | null; price_usd: number | null }) => ({
      id: h.id, store: h.store, title: h.title, productUrl: h.product_url, imageUrl: h.image_url, priceUsd: h.price_usd, currency: "USD", condition: null, seller: null, source: "catalogue",
    }),
    listingFromEbaySummary: (i: { legacyItemId: string; title: string; price: { value: string }; image?: { imageUrl: string }; condition?: string; seller?: { feedbackPercentage: string; feedbackScore: number } }) => ({
      id: i.legacyItemId, store: "ebay", title: i.title, productUrl: `https://www.ebay.com/itm/${i.legacyItemId}`, imageUrl: i.image?.imageUrl ?? null, priceUsd: Number(i.price.value), currency: "USD", condition: i.condition ?? "New", seller: "s",
      sellerFeedback: { percent: Number(i.seller?.feedbackPercentage ?? 100), score: i.seller?.feedbackScore ?? 500 }, source: "live",
    }),
  };
});

import { HERO_PRODUCTS, HERO_ROTATION_MS } from "@/config/hero-products";
import { searchCatalogProducts } from "@/db/queries/catalog";
import { searchEbayItems } from "@/lib/ebay/browse";
import { calculatePricing } from "@/features/pricing/services/pricing.service";

import { getHeroProduct } from "../hero-product.service";

const at = (i: number) => i * HERO_ROTATION_MS + 60_000;
const slotOf = (query: string) => HERO_PRODUCTS.findIndex((p) => p.query === query);
const breakdown = (total: number) => ({ pricing_method: "weight_based", subtotal_usd: 179.99, exchange_rate: 12.28, tax_usd: 15.84, value_fee_percentage: 0.04, value_fee_usd: 7.2, flat_rate_ghs: 110.52, total_ghs: total, freight_usd: 9 }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(calculatePricing).mockResolvedValue(breakdown(2679.45));
});

describe("getHeroProduct", () => {
  it("prices the window's product from a real catalogue listing, skipping accessories and renewed rows", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([
      { id: "case", store: "amazon", title: "ESR for AirPods Pro 3 Case", product_url: "u1", image_url: "i1", price_usd: 16.99 },
      { id: "renewed", store: "amazon", title: "Apple AirPods Pro 3 (Renewed)", product_url: "u2", image_url: "i2", price_usd: 139 },
      { id: "real", store: "amazon", title: "Apple AirPods Pro 3 Wireless Earbuds with Active Noise Cancellation", product_url: "u3", image_url: "https://m.media-amazon.com/a.jpg", price_usd: 179.99 },
    ] as never);
    const hero = await getHeroProduct(at(slotOf("AirPods Pro 3")));
    expect(hero).toMatchObject({ storeName: "Amazon", imageUrl: "https://m.media-amazon.com/a.jpg" });
    expect(hero!.example.input.product_title).toBe("Apple AirPods Pro 3 Wireless Earbuds with Active Noise Cancellation");
    expect(vi.mocked(calculatePricing).mock.calls[0]![0]).toMatchObject({ itemPriceUsd: 179.99, category: "Headphones", region: "usa" });
  });

  it("takes an iPhone from eBay only from a good seller, at a believable price", async () => {
    const item = (id: string, price: string, extra: Record<string, unknown> = {}) => ({ legacyItemId: id, title: "Apple iPhone 17 Pro 256GB Unlocked - NEW", price: { value: price }, image: { imageUrl: `https://i.ebayimg.com/${id}.jpg` }, ...extra });
    vi.mocked(searchEbayItems).mockResolvedValue([
      item("fake", "299"),
      item("weak", "1050", { seller: { feedbackPercentage: "90", feedbackScore: 3 } }),
      item("ok", "1099"),
      item("dear", "1199"),
      item("box", "1080", { title: "Apple iPhone 17 Pro 256GB NEW damaged box" }),
    ] as never);
    const hero = await getHeroProduct(at(slotOf("iPhone 17 Pro 256GB unlocked")));
    expect(hero).toMatchObject({ storeName: "eBay", imageUrl: "https://i.ebayimg.com/ok.jpg" });
  });

  it("moves to the next product when the window's own has no listing", async () => {
    vi.mocked(searchEbayItems).mockResolvedValue([]);
    vi.mocked(searchCatalogProducts).mockImplementation(async ({ q }) =>
      q === "AirPods Pro 3" ? ([{ id: "real", store: "amazon", title: "Apple AirPods Pro 3 Wireless Earbuds", product_url: "u", image_url: "https://m.media-amazon.com/a.jpg", price_usd: 179.99 }] as never) : [],
    );
    const hero = await getHeroProduct(at(slotOf("iPhone 17 Pro 256GB unlocked")));
    expect(hero?.example.input.product_title).toBe("Apple AirPods Pro 3 Wireless Earbuds");
  });
});
