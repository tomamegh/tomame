import { describe, expect, it } from "vitest";

import {
  EMPTY_SHOP_STATE,
  SHOP_MAX_PAGE,
  SHOP_PRICE_BUCKETS,
  activePriceBucket,
  activeShopChips,
  clearFiltersHref,
  countActiveFilters,
  isGroupedView,
  paginationWindow,
  parseShopParams,
  priceRangeLabel,
  shopHref,
  toggleCondition,
  toggleStore,
  type ShopState,
} from "../shop-params";

const CATEGORIES = ["Headphones", "TV & Video", "Cell Phones & Accessories"];
const state = (patch: Partial<ShopState> = {}): ShopState => ({ ...EMPTY_SHOP_STATE, ...patch });
const query = (href: string) => new URL(href, "http://x").searchParams;

describe("parseShopParams", () => {
  it("reads nothing as the empty state", () => {
    expect(parseShopParams({ mode: "browse" }, CATEGORIES)).toEqual(EMPTY_SHOP_STATE);
  });

  it("matches the department case-insensitively and ignores one the catalogue does not hold", () => {
    expect(parseShopParams({ category: "tv & video" }, CATEGORIES).category).toBe("TV & Video");
    expect(parseShopParams({ category: "Garden" }, CATEGORIES).category).toBeNull();
  });

  it("accepts ?department= as an alias and writes it back as ?category=", () => {
    const parsed = parseShopParams({ department: "headphones" }, CATEGORIES);
    expect(parsed.category).toBe("Headphones");
    expect(shopHref(parsed)).toBe("/app/orders/new?mode=browse&category=Headphones");
  });

  it("takes stores and conditions repeated or comma-joined, known values only, in a fixed order", () => {
    const parsed = parseShopParams({ store: ["ebay", "AMAZON", "walmart"], condition: "used,new,broken" });
    expect(parsed.stores).toEqual(["amazon", "ebay"]);
    expect(parsed.conditions).toEqual(["new", "used"]);
  });

  it("reads GH₵ bounds as whole positive cedis and swaps a reversed range", () => {
    expect(parseShopParams({ min: "GH₵1,500", max: "999.6" })).toMatchObject({ minGhs: 1000, maxGhs: 1500 });
    expect(parseShopParams({ min: "-5", max: "abc" })).toMatchObject({ minGhs: null, maxGhs: null });
    expect(parseShopParams({ min: "0" }).minGhs).toBeNull();
  });

  it("accepts only the ratings the sidebar offers", () => {
    expect(parseShopParams({ rating: "4" }).rating).toBe(4);
    expect(parseShopParams({ rating: "5" }).rating).toBeNull();
  });

  it("falls back to recommended for an unknown sort", () => {
    expect(parseShopParams({ sort: "price_desc" }).sort).toBe("price_desc");
    expect(parseShopParams({ sort: "cheapest" }).sort).toBe("recommended");
  });

  it("clamps the page to 1..max and ignores junk", () => {
    expect(parseShopParams({ page: "3" }).page).toBe(3);
    expect(parseShopParams({ page: "0" }).page).toBe(1);
    expect(parseShopParams({ page: "x" }).page).toBe(1);
    expect(parseShopParams({ page: "99999999" }).page).toBe(SHOP_MAX_PAGE);
  });

  it("ignores the old ?n= page size", () => {
    expect(parseShopParams({ n: "48" }, CATEGORIES)).toEqual(EMPTY_SHOP_STATE);
  });
});

describe("shopHref", () => {
  it("writes the bare browse address for the empty state", () => {
    expect(shopHref(EMPTY_SHOP_STATE)).toBe("/app/orders/new?mode=browse");
  });

  it("round-trips through parseShopParams", () => {
    const original = state({
      q: "earbuds",
      category: "Headphones",
      stores: ["ebay"],
      conditions: ["refurbished", "open_box"],
      minGhs: 500,
      maxGhs: 1000,
      rating: 4,
      sort: "price_asc",
      page: 3,
    });
    const href = shopHref(original, { page: 3 });
    const params = Object.fromEntries(
      [...query(href).keys()].map((k) => [k, query(href).getAll(k).length > 1 ? query(href).getAll(k) : query(href).get(k)!]),
    );
    expect(parseShopParams(params, CATEGORIES)).toEqual({ ...original, conditions: ["open_box", "refurbished"] });
  });

  it("sends any change but the page back to page one", () => {
    const onPage4 = state({ page: 4, stores: ["amazon"] });
    expect(query(shopHref(onPage4, toggleStore(onPage4, "ebay"))).get("page")).toBeNull();
    expect(query(shopHref(onPage4, { page: 5 })).get("page")).toBe("5");
    expect(query(shopHref(onPage4, { page: 1 })).get("page")).toBeNull();
  });

  it("never writes defaults, and writes view=all only when nothing else leaves the grouped page", () => {
    expect(shopHref(state(), { sort: "recommended" })).toBe("/app/orders/new?mode=browse");
    expect(query(shopHref(state(), { view: "all" })).get("view")).toBe("all");
    expect(query(shopHref(state({ view: "all" }), { sort: "rating" })).get("view")).toBeNull();
  });

  it("gives equal states equal addresses regardless of the order filters were added", () => {
    const a = shopHref(state({ stores: ["ebay", "amazon"], conditions: ["used", "new"] }));
    const b = shopHref(state({ stores: ["amazon", "ebay"], conditions: ["new", "used"] }));
    expect(a).toBe(b);
  });
});

describe("grouping and chips", () => {
  it("groups only when nothing at all has been asked", () => {
    expect(isGroupedView(state())).toBe(true);
    expect(isGroupedView(state({ q: "tv" }))).toBe(false);
    expect(isGroupedView(state({ sort: "newest" }))).toBe(false);
    expect(isGroupedView(state({ page: 2 }))).toBe(false);
    expect(isGroupedView(state({ view: "all" }))).toBe(false);
    expect(isGroupedView(state({ rating: 3 }))).toBe(false);
  });

  it("counts a price range as one filter and ignores the search and sort", () => {
    expect(countActiveFilters(state({ q: "x", sort: "rating", minGhs: 1, maxGhs: 2, stores: ["ebay"] }))).toBe(2);
  });

  it("makes one chip per filter, each removing only itself", () => {
    const s = state({ category: "Headphones", stores: ["amazon", "ebay"], minGhs: 1000, maxGhs: 2500, q: "sony" });
    const chips = activeShopChips(s);
    expect(chips.map((c) => c.label)).toEqual(["Headphones", "Amazon", "eBay", "GH₵1,000 – GH₵2,500"]);
    const withoutAmazon = query(chips[1]!.removeHref);
    expect(withoutAmazon.getAll("store")).toEqual(["ebay"]);
    expect(withoutAmazon.get("category")).toBe("Headphones");
    expect(withoutAmazon.get("q")).toBe("sony");
  });

  it("clears every filter but keeps the search and the sort", () => {
    const href = clearFiltersHref(state({ q: "sony", sort: "rating", stores: ["ebay"], rating: 4, category: "Headphones" }));
    expect(href).toBe("/app/orders/new?mode=browse&q=sony&sort=rating");
  });

  it("toggles stores and conditions on and off", () => {
    const s = state({ stores: ["amazon"], conditions: ["new"] });
    expect(toggleStore(s, "amazon").stores).toEqual([]);
    expect(toggleStore(s, "ebay").stores).toEqual(["amazon", "ebay"]);
    expect(toggleCondition(s, "new").conditions).toEqual([]);
  });
});

describe("price buckets", () => {
  it("covers the whole line with no gaps, open at both ends", () => {
    expect(SHOP_PRICE_BUCKETS[0]).toMatchObject({ min: null, max: 500 });
    expect(SHOP_PRICE_BUCKETS.at(-1)).toMatchObject({ min: 10000, max: null });
    for (let i = 1; i < SHOP_PRICE_BUCKETS.length; i += 1) {
      expect(SHOP_PRICE_BUCKETS[i]!.min).toBe(SHOP_PRICE_BUCKETS[i - 1]!.max);
      expect(SHOP_PRICE_BUCKETS[i]!.index).toBe(i);
    }
  });

  it("recognises a bucket and labels a custom range", () => {
    expect(activePriceBucket(state({ minGhs: 500, maxGhs: 1000 }))?.index).toBe(1);
    expect(activePriceBucket(state({ minGhs: 600, maxGhs: 1000 }))).toBeNull();
    expect(priceRangeLabel(600, null)).toBe("GH₵600 and up");
    expect(priceRangeLabel(null, 900)).toBe("Up to GH₵900");
    expect(priceRangeLabel(null, null)).toBeNull();
  });
});

describe("paginationWindow", () => {
  it("shows every page when there are few", () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
    expect(paginationWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("folds long runs into gaps around the current page", () => {
    expect(paginationWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(paginationWindow(1, 12)).toEqual([1, 2, null, 12]);
    expect(paginationWindow(12, 12)).toEqual([1, null, 11, 12]);
  });

  it("draws a single skipped page as the page, not a gap", () => {
    expect(paginationWindow(4, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
  });
});
