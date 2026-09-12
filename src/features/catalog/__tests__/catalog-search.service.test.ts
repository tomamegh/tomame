import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/db/queries/catalog", () => ({
  claimNextDueQuery: vi.fn(),
  markQueryResult: vi.fn(),
  upsertCatalogProducts: vi.fn(),
  searchCatalogProducts: vi.fn(),
  getOrCreateBudget: vi.fn(),
  incrementBudget: vi.fn(),
}));

const calculate = vi.fn();
vi.mock("@/features/pricing/services/pricing.service", () => ({
  loadPricingCalculator: vi.fn(async () => ({ calculate })),
}));

import { searchCatalogProducts, type CatalogSearchHit } from "@/db/queries/catalog";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { searchCatalog } from "../services/catalog-search.service";

function hit(overrides: Partial<CatalogSearchHit>): CatalogSearchHit {
  return {
    id: "p",
    store: "amazon",
    external_id: null,
    product_url: "https://www.amazon.com/dp/B000000000",
    title: "Thing",
    image_url: null,
    price_usd: 10,
    currency: "USD",
    rating: null,
    review_count: null,
    category: "Headphones",
    last_seen_at: "2026-09-12T00:00:00Z",
    rank: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Landed total = 20 × price; enough to make ordering observable.
  calculate.mockImplementation(async (input: { itemPriceUsd?: number; itemPrice?: number }) => {
    const price = input.itemPriceUsd ?? input.itemPrice ?? 0;
    return { total_ghs: price * 20, pricing_group: "phone_accessories", pricing_method: "flat_rate", exchange_rate: 15.5 };
  });
});

describe("searchCatalog", () => {
  it("returns an empty result without loading the pricing engine", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([]);
    const out = await searchCatalog("  nothing ", { limit: 12 });
    expect(out).toEqual({ query: "nothing", count: 0, results: [] });
    expect(loadPricingCalculator).not.toHaveBeenCalled();
  });

  it("loads the calculator once, prices every hit, sorts by landed total and marks the cheapest per store", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([
      hit({ id: "a1", store: "amazon", price_usd: 30, rank: 0.9 }),
      hit({ id: "e1", store: "ebay", price_usd: 12, product_url: "https://www.ebay.com/itm/1", rank: 0.8 }),
      hit({ id: "a2", store: "amazon", price_usd: 9.5, rank: 0.7 }),
      hit({ id: "e2", store: "ebay", price_usd: 40, product_url: "https://www.ebay.com/itm/2", rank: 0.6 }),
    ]);

    const out = await searchCatalog("earbuds", { limit: 12 });

    expect(loadPricingCalculator).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledTimes(4);
    expect(calculate).toHaveBeenCalledWith(
      { itemPriceUsd: 30, quantity: 1, category: "Headphones", productTitle: "Thing", region: "usa" },
      null,
    );
    expect(out.results.map((r) => r.id)).toEqual(["a2", "e1", "a1", "e2"]);
    expect(out.results.map((r) => r.total_ghs)).toEqual([190, 240, 600, 800]);
    expect(out.results.filter((r) => r.cheapest_in_store).map((r) => r.id)).toEqual(["a2", "e1"]);
    expect(out.results.every((r) => r.product_url.length > 0)).toBe(true);
    expect(out.results[0]!.pricing_group).toBe("phone_accessories");
  });

  it("flags rows with no price, or that the engine rejects, as unpriceable and sorts them last", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([
      hit({ id: "nopx", price_usd: null, currency: null, rank: 0.99 }),
      hit({ id: "boom", price_usd: 5, rank: 0.95 }),
      hit({ id: "ok", price_usd: 50, rank: 0.5 }),
    ]);
    calculate.mockImplementation(async (input: { itemPriceUsd?: number }) => {
      if (input.itemPriceUsd === 5) throw new Error("An item price is required to calculate pricing.");
      return { total_ghs: (input.itemPriceUsd ?? 0) * 20, pricing_group: null, pricing_method: "needs_review", exchange_rate: 15.5 };
    });

    const out = await searchCatalog("earbuds", { limit: 12 });

    expect(out.results.map((r) => r.id)).toEqual(["ok", "nopx", "boom"]);
    expect(out.results[0]).toMatchObject({ unpriceable: false, cheapest_in_store: true, total_ghs: 1000 });
    expect(out.results[1]).toMatchObject({ unpriceable: true, total_ghs: null, cheapest_in_store: false });
    expect(out.results[2]).toMatchObject({ unpriceable: true, total_ghs: null });
    // The engine is never asked to price a row with no listed price.
    expect(calculate).toHaveBeenCalledTimes(2);
  });

  it("passes a non-USD listing as itemPrice + itemCurrency so the engine converts it", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([hit({ id: "gbp", price_usd: 20, currency: "GBP" })]);
    await searchCatalog("kettle", { limit: 5 });
    expect(calculate).toHaveBeenCalledWith(expect.objectContaining({ itemPrice: 20, itemCurrency: "GBP" }), null);
  });
});
