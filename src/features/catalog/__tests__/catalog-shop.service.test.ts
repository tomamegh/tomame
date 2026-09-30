import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/db/queries/catalog", () => ({
  browseCatalogProducts: vi.fn(),
  listCatalogShopFacets: vi.fn(),
  listCatalogDepartmentTops: vi.fn(),
  listCatalogRowsNeedingLandedPrice: vi.fn(),
  readOldestLandedPriceStamp: vi.fn(),
  writeCatalogLandedPrices: vi.fn(),
}));

const calculate = vi.fn();
vi.mock("@/features/pricing/services/pricing.service", () => ({
  loadPricingCalculator: vi.fn(async () => ({ calculate })),
}));

import {
  browseCatalogProducts,
  listCatalogRowsNeedingLandedPrice,
  listCatalogShopFacets,
  readOldestLandedPriceStamp,
  writeCatalogLandedPrices,
  type CatalogShopHit,
} from "@/db/queries/catalog";
import {
  readLandedPriceFreshness,
  refreshCatalogLandedPrices,
} from "../services/catalog-landed-price.service";
import { getShopPage, toShopFacets, toShopQuery } from "../services/catalog-shop.service";
import { EMPTY_SHOP_STATE, SHOP_PAGE_SIZE, SHOP_PRICE_EDGES } from "../shop-params";

const breakdown = (total: number) => ({
  pricing_method: "flat_rate",
  pricing_group: "g",
  total_ghs: total,
  total_pesewas: Math.round(total * 100),
  exchange_rate: 15,
});

function row(overrides: Partial<CatalogShopHit>): CatalogShopHit {
  return {
    id: "p",
    store: "ebay",
    external_id: null,
    product_url: "https://www.ebay.com/itm/1",
    title: "Thing",
    image_url: null,
    price_usd: 10,
    currency: "USD",
    rating: null,
    review_count: null,
    category: "Headphones",
    last_seen_at: "2026-09-14T00:00:00Z",
    rank: 0,
    landed_ghs: 400,
    condition_group: "refurbished",
    total_count: 30,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toShopQuery", () => {
  it("passes every filter through and a blank search as none", () => {
    expect(
      toShopQuery({ ...EMPTY_SHOP_STATE, q: "  ", stores: ["ebay"], minGhs: 5, rating: 4, category: "TV & Video" }),
    ).toEqual({
      q: null,
      category: "TV & Video",
      stores: ["ebay"],
      conditions: [],
      minGhs: 5,
      maxGhs: null,
      minRating: 4,
    });
  });
});

describe("toShopFacets", () => {
  it("fills every fixed option, zero where the database had no row, and sorts departments largest first", () => {
    const facets = toShopFacets([
      { facet: "category", value: "TV & Video", n: 3 },
      { facet: "category", value: "Headphones", n: 9 },
      { facet: "store", value: "ebay", n: 12 },
      { facet: "condition", value: "used", n: 2 },
      { facet: "price", value: "1", n: 7 },
      { facet: "rating", value: "4", n: 1 },
      { facet: "range", value: "min", n: 281 },
      { facet: "range", value: "max", n: 52504 },
    ]);
    expect(facets.departments.map((d) => d.value)).toEqual(["Headphones", "TV & Video"]);
    expect(facets.stores).toEqual([
      { value: "amazon", count: 0 },
      { value: "ebay", count: 12 },
    ]);
    expect(facets.conditions.find((c) => c.value === "used")?.count).toBe(2);
    expect(facets.prices).toHaveLength(SHOP_PRICE_EDGES.length + 1);
    expect(facets.prices[1]).toMatchObject({ count: 7, bucket: { min: 500, max: 1000 } });
    expect(facets.ratings).toEqual([
      { value: 4, count: 1 },
      { value: 3, count: 0 },
    ]);
    expect(facets.range).toEqual({ min: 281, max: 52504 });
  });

  it("has no range when nothing is priced", () => {
    expect(toShopFacets([]).range).toBeNull();
  });
});

describe("getShopPage", () => {
  it("pages in the database and prices only the page, keeping the database's order", async () => {
    vi.mocked(browseCatalogProducts).mockResolvedValue({
      rows: [row({ id: "a", price_usd: 20 }), row({ id: "b", price_usd: 10 })],
      total: 30,
    });
    vi.mocked(listCatalogShopFacets).mockResolvedValue([]);
    calculate.mockImplementation(async (input: { itemPriceUsd: number }) => breakdown(input.itemPriceUsd * 20));

    const result = await getShopPage({ ...EMPTY_SHOP_STATE, page: 2, sort: "price_desc" });

    expect(browseCatalogProducts).toHaveBeenCalledWith(expect.anything(), {
      sort: "price_desc",
      limit: SHOP_PAGE_SIZE,
      offset: SHOP_PAGE_SIZE,
    });
    expect(result.kind).toBe("page");
    if (result.kind !== "page") return;
    expect(result.products.map((p) => [p.id, p.total_ghs, p.condition_group])).toEqual([
      ["a", 400, "refurbished"],
      ["b", 200, "refurbished"],
    ]);
    expect(result.pageCount).toBe(2);
    expect(calculate).toHaveBeenCalledTimes(2);
  });

  it("says a page is past the end instead of drawing an empty grid", async () => {
    vi.mocked(browseCatalogProducts).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(listCatalogShopFacets).mockResolvedValue([
      { facet: "store", value: "amazon", n: 30 },
      { facet: "store", value: "ebay", n: 5 },
    ]);

    const result = await getShopPage({ ...EMPTY_SHOP_STATE, stores: ["amazon"], page: 9 });
    expect(result).toMatchObject({ kind: "past-end", total: 30, pageCount: 2 });
  });

  it("reports an empty set as an empty page", async () => {
    vi.mocked(browseCatalogProducts).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(listCatalogShopFacets).mockResolvedValue([]);
    const result = await getShopPage({ ...EMPTY_SHOP_STATE, q: "zzz" });
    expect(result).toMatchObject({ kind: "page", products: [], total: 0 });
  });
});

describe("stored landed prices", () => {
  it("reads freshness from the oldest stamp", async () => {
    const now = new Date("2026-09-30T12:00:00Z");
    vi.mocked(readOldestLandedPriceStamp).mockResolvedValueOnce(undefined);
    expect(await readLandedPriceFreshness(now)).toBe("empty");
    vi.mocked(readOldestLandedPriceStamp).mockResolvedValueOnce(null);
    expect(await readLandedPriceFreshness(now)).toBe("missing");
    vi.mocked(readOldestLandedPriceStamp).mockResolvedValueOnce("2026-09-30T11:30:00Z");
    expect(await readLandedPriceFreshness(now)).toBe("fresh");
    vi.mocked(readOldestLandedPriceStamp).mockResolvedValueOnce("2026-09-30T10:00:00Z");
    expect(await readLandedPriceFreshness(now)).toBe("stale");
  });

  it("strikes every due row through the calculator and stamps declined rows with no figure", async () => {
    vi.mocked(listCatalogRowsNeedingLandedPrice).mockResolvedValue([
      { id: "a", title: "A", price_usd: 10, currency: "USD", category: "Headphones" },
      { id: "b", title: "B", price_usd: null, currency: "USD", category: "Headphones" },
      { id: "c", title: "C", price_usd: 50, currency: "USD", category: "Mystery" },
    ]);
    vi.mocked(writeCatalogLandedPrices).mockResolvedValue(3);
    calculate.mockImplementation(async (input: { category: string; itemPriceUsd: number }) =>
      input.category === "Mystery"
        ? { pricing_method: "needs_review", total_ghs: 0, total_pesewas: 0 }
        : breakdown(input.itemPriceUsd * 20),
    );

    const summary = await refreshCatalogLandedPrices(new Date("2026-09-30T12:00:00Z"));

    expect(listCatalogRowsNeedingLandedPrice).toHaveBeenCalledWith({
      staleBeforeIso: "2026-09-30T11:00:00.000Z",
      limit: 1000,
    });
    expect(writeCatalogLandedPrices).toHaveBeenCalledWith([
      { id: "a", landed_ghs: 200 },
      { id: "b", landed_ghs: null },
      { id: "c", landed_ghs: null },
    ]);
    expect(summary).toEqual({ considered: 3, priced: 1, declined: 2, written: 3 });
  });

  it("does nothing when every figure is fresh", async () => {
    vi.mocked(listCatalogRowsNeedingLandedPrice).mockResolvedValue([]);
    const summary = await refreshCatalogLandedPrices();
    expect(summary.considered).toBe(0);
    expect(writeCatalogLandedPrices).not.toHaveBeenCalled();
  });
});
