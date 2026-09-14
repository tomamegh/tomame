import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/db/queries/catalog", () => ({
  claimNextDueQuery: vi.fn(),
  markQueryResult: vi.fn(),
  upsertCatalogProducts: vi.fn(),
  searchCatalogProducts: vi.fn(),
  listCatalogCategories: vi.fn(),
  listCatalogProductsByCategory: vi.fn(),
  getOrCreateBudget: vi.fn(),
  incrementBudget: vi.fn(),
}));

const calculate = vi.fn();
vi.mock("@/features/pricing/services/pricing.service", () => ({
  loadPricingCalculator: vi.fn(async () => ({ calculate })),
}));

import {
  listCatalogCategories,
  listCatalogProductsByCategory,
  searchCatalogProducts,
  type CatalogSearchHit,
} from "@/db/queries/catalog";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import {
  browseCatalogCategory,
  listBrowsableCategories,
  searchCatalog,
} from "../services/catalog-search.service";

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
    expect(out).toEqual({ query: "nothing", count: 0, total: 0, results: [] });
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
      // `flat_rate`, not `needs_review`: a review breakdown's totals are all zero
      // (calculator.ts:506), so a fixture pairing it with a real total describes
      // a breakdown the engine cannot emit — and this row is meant to be the one
      // that PRICES cleanly.
      return { total_ghs: (input.itemPriceUsd ?? 0) * 20, pricing_group: null, pricing_method: "flat_rate", exchange_rate: 15.5 };
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

  /**
   * `total` is what lets the screen say "24 of 63" and decide whether to offer
   * "show more". It comes off the first row, where 062's window function put it.
   */
  it("reports the whole match as the total, not the page it returned", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([
      hit({ id: "a", price_usd: 10, total_count: 63 }),
      hit({ id: "b", price_usd: 20, total_count: 63 }),
    ]);
    const out = await searchCatalog("earbuds", { limit: 2 });
    expect(out.count).toBe(2);
    expect(out.total).toBe(63);
  });

  it("falls back to the page size when the RPC carries no total, rather than inventing one", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([hit({ id: "a", price_usd: 10 })]);
    const out = await searchCatalog("earbuds", { limit: 12 });
    expect(out.total).toBe(1);
  });

  /**
   * `needs_review` arrives as a COMPLETE breakdown whose totals are all zero
   * rather than as a null, so a `!= null` guard reads it as a price. On screen
   * that was "GH₵0.00 delivered to your door" against a real dollar listing,
   * sorted to the front of the page as the cheapest thing we sell.
   */
  it("treats a needs_review breakdown as unpriceable, not as a free product", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([
      hit({ id: "review", price_usd: 79.99, category: "Smart Home" }),
      hit({ id: "real", price_usd: 50 }),
    ]);
    calculate.mockImplementation(async (input: { itemPriceUsd?: number }) =>
      input.itemPriceUsd === 79.99
        ? { total_ghs: 0, pricing_group: "sound_speakers", pricing_method: "needs_review", exchange_rate: 15.5 }
        : { total_ghs: 1000, pricing_group: "phone_accessories", pricing_method: "flat_rate", exchange_rate: 15.5 },
    );

    const out = await searchCatalog("speaker", { limit: 12 });

    // Unpriceable, parked at the end, and carrying no figure the card could print.
    expect(out.results.map((r) => r.id)).toEqual(["real", "review"]);
    expect(out.results[1]).toMatchObject({ id: "review", unpriceable: true, total_ghs: null });
    // And it must never be the cheapest thing in its store.
    expect(out.results[1]!.cheapest_in_store).toBe(false);
  });

  it("refuses a zero or negative total even when the method looks fine", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([hit({ id: "zero", price_usd: 20 })]);
    calculate.mockResolvedValue({
      total_ghs: 0,
      pricing_group: "phone_accessories",
      pricing_method: "flat_rate",
      exchange_rate: 15.5,
    });

    const out = await searchCatalog("thing", { limit: 12 });
    expect(out.results[0]).toMatchObject({ unpriceable: true, total_ghs: null });
  });

  it("hands the category straight through, so a pill narrows the search instead of replacing it", async () => {
    vi.mocked(searchCatalogProducts).mockResolvedValue([]);
    await searchCatalog("earbuds", { limit: 12, category: "Headphones" });
    expect(searchCatalogProducts).toHaveBeenCalledWith({ q: "earbuds", limit: 12, category: "Headphones" });

    await searchCatalog("earbuds", { limit: 12 });
    expect(searchCatalogProducts).toHaveBeenLastCalledWith({ q: "earbuds", limit: 12, category: null });
  });
});


/**
 * Browsing is the way into the catalogue that needs nothing from the customer.
 * Kelvin: "To access search without a link, a user must first search with a
 * link, and then navigate there."
 */
describe("browseCatalogCategory", () => {
  it("prices a category and re-sorts on the landed total, not the store price", async () => {
    // The query can only order by `price_usd`. That is not the number the
    // customer pays: freight is per weight and per group, so a cheaper listing
    // can land dearer. The service must redo the ordering on the real figure.
    vi.mocked(listCatalogProductsByCategory).mockResolvedValue([
      hit({ id: "a", price_usd: 30 }),
      hit({ id: "b", price_usd: 10 }),
    ]);
    calculate.mockImplementation(async (input: { itemPriceUsd?: number }) => ({
      // Deliberately inverts the store order: the $30 item lands cheapest.
      total_ghs: input.itemPriceUsd === 30 ? 100 : 900,
      pricing_group: "g",
      pricing_method: "flat_rate",
      exchange_rate: 15.5,
    }));

    const out = await browseCatalogCategory("Headphones", { limit: 12 });
    expect(out.results.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out.results[0]!.total_ghs).toBe(100);
  });

  it("puts what it could not price last, and flags rather than hides it", async () => {
    vi.mocked(listCatalogProductsByCategory).mockResolvedValue([
      hit({ id: "priced", price_usd: 10 }),
      hit({ id: "no-price", price_usd: null }),
    ]);

    const out = await browseCatalogCategory("Headphones", { limit: 12 });
    expect(out.results.map((r) => r.id)).toEqual(["priced", "no-price"]);
    expect(out.results[1]!.unpriceable).toBe(true);
    expect(out.results[1]!.total_ghs).toBeNull();
  });

  it("marks the cheapest in each store once the real totals are known", async () => {
    vi.mocked(listCatalogProductsByCategory).mockResolvedValue([
      hit({ id: "az-dear", store: "amazon", price_usd: 30 }),
      hit({ id: "az-cheap", store: "amazon", price_usd: 10 }),
      hit({ id: "eb", store: "ebay", price_usd: 20 }),
    ]);

    const out = await browseCatalogCategory("Headphones", { limit: 12 });
    const cheapest = out.results.filter((r) => r.cheapest_in_store).map((r) => r.id);
    expect(cheapest).toEqual(["az-cheap", "eb"]);
  });

  it("does not load the pricing engine for an empty category", async () => {
    vi.mocked(listCatalogProductsByCategory).mockResolvedValue([]);

    const out = await browseCatalogCategory("Nothing Here", { limit: 12 });
    expect(out).toEqual({ query: "Nothing Here", count: 0, total: 0, results: [] });
    expect(loadPricingCalculator).not.toHaveBeenCalled();
  });
});

describe("listBrowsableCategories", () => {
  it("hands back what the catalogue holds, largest first", async () => {
    // Derived from the products themselves, so the browse screen can never
    // offer a heading that opens onto nothing.
    vi.mocked(listCatalogCategories).mockResolvedValue([
      { category: "Headphones", count: 175 },
      { category: "Computers", count: 108 },
    ]);

    expect(await listBrowsableCategories()).toEqual([
      { category: "Headphones", count: 175 },
      { category: "Computers", count: 108 },
    ]);
  });
});
