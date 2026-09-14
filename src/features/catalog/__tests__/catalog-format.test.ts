import { describe, expect, it } from "vitest";

import { CATALOG_SEARCH } from "@/config/catalog";
import {
  catalogQuoteHref,
  catalogStoreLabel,
  formatCatalogRating,
  formatPriceAge,
  isSameListing,
  pickSimilarProducts,
  resolveCatalogQuery,
} from "../components/format";
import type { CatalogProduct } from "../types";

const NOW = new Date("2026-09-14T12:00:00Z");

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    store: "amazon",
    external_id: null,
    title: "Oraimo BoomPop Wireless Headphones",
    image_url: null,
    product_url: "https://www.amazon.com/dp/B0TEST1",
    price_usd: 40,
    currency: "USD",
    rating: null,
    review_count: null,
    category: null,
    last_seen_at: "2026-09-14T09:00:00Z",
    total_ghs: 812.5,
    pricing_group: "electronics",
    pricing_method: "weight",
    exchange_rate: 13.2,
    unpriceable: false,
    cheapest_in_store: false,
    ...overrides,
  };
}

describe("resolveCatalogQuery", () => {
  it("reads no query at all as idle", () => {
    expect(resolveCatalogQuery(undefined)).toEqual({ kind: "idle" });
    expect(resolveCatalogQuery("   ")).toEqual({ kind: "idle" });
  });

  it("reports a query shorter than the server accepts", () => {
    expect(resolveCatalogQuery("a")).toEqual({
      kind: "too-short",
      typed: "a",
      minLength: CATALOG_SEARCH.minQueryLength,
    });
  });

  it("trims and runs a usable query", () => {
    expect(resolveCatalogQuery("  wireless earbuds ")).toEqual({
      kind: "ready",
      query: "wireless earbuds",
      truncated: false,
    });
  });

  it("cuts an over-long query to the cap rather than rejecting it", () => {
    const long = "a".repeat(CATALOG_SEARCH.maxQueryLength + 40);
    const state = resolveCatalogQuery(long);
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.query).toHaveLength(CATALOG_SEARCH.maxQueryLength);
    expect(state.truncated).toBe(true);
  });

  it("takes the first value when the URL repeats the parameter", () => {
    expect(resolveCatalogQuery(["air fryer", "kettle"])).toEqual({
      kind: "ready",
      query: "air fryer",
      truncated: false,
    });
  });
});

describe("formatPriceAge", () => {
  it("reads a reading from the same day as today", () => {
    expect(formatPriceAge("2026-09-14T02:00:00Z", NOW)).toEqual({
      label: "checked today",
      stale: false,
    });
  });

  it("names yesterday and the days after it", () => {
    expect(formatPriceAge("2026-09-13T06:00:00Z", NOW)?.label).toBe(
      "checked yesterday",
    );
    expect(formatPriceAge("2026-09-11T06:00:00Z", NOW)?.label).toBe(
      "checked 3 days ago",
    );
  });

  it("flags a reading older than a week and dates it", () => {
    const age = formatPriceAge("2026-09-01T06:00:00Z", NOW);
    expect(age?.stale).toBe(true);
    // "Sep" or "Sept" depending on the ICU data the runtime ships; the assertion
    // is that the clause names the day and month, not which abbreviation wins.
    expect(age?.label).toMatch(/^checked on 1 Sept?$/);
  });

  it("rounds clock skew to today rather than claiming the future", () => {
    expect(formatPriceAge("2026-09-14T12:30:00Z", NOW)).toEqual({
      label: "checked today",
      stale: false,
    });
  });

  it("drops the clause for an unreadable timestamp", () => {
    expect(formatPriceAge("not a date", NOW)).toBeNull();
  });
});

describe("formatCatalogRating", () => {
  it("prints the stars and the review count", () => {
    expect(formatCatalogRating(4.55, 2481)).toBe("4.6 (2,481)");
  });

  it("prints stars alone when there is no count", () => {
    expect(formatCatalogRating(4, null)).toBe("4");
    expect(formatCatalogRating(4, 0)).toBe("4");
  });

  it("shows nothing when there is no rating to show", () => {
    expect(formatCatalogRating(null, 900)).toBeNull();
    expect(formatCatalogRating(0, 900)).toBeNull();
  });
});

describe("catalogQuoteHref", () => {
  it("hands off to the ordinary paste flow with the url encoded", () => {
    expect(catalogQuoteHref("https://www.amazon.com/dp/B0?a=1&b=2")).toBe(
      "/app/orders/new?url=https%3A%2F%2Fwww.amazon.com%2Fdp%2FB0%3Fa%3D1%26b%3D2",
    );
  });
});

describe("catalogStoreLabel", () => {
  it("writes the two stores the way copy does", () => {
    expect(catalogStoreLabel("amazon")).toBe("Amazon");
    expect(catalogStoreLabel("ebay")).toBe("eBay");
  });
});

describe("isSameListing", () => {
  it("ignores host case, a trailing slash and tracking parameters", () => {
    expect(
      isSameListing(
        "https://WWW.Amazon.com/dp/B0TEST1/",
        "https://www.amazon.com/dp/b0test1?ref=nav",
      ),
    ).toBe(true);
  });

  it("keeps two different listings apart", () => {
    expect(
      isSameListing(
        "https://www.amazon.com/dp/B0TEST1",
        "https://www.amazon.com/dp/B0TEST2",
      ),
    ).toBe(false);
  });

  it("falls back to plain text for a url it cannot parse", () => {
    expect(isSameListing("not a url", "not a url")).toBe(true);
    expect(isSameListing("not a url", "other")).toBe(false);
  });
});

describe("pickSimilarProducts", () => {
  const quoted = "https://www.amazon.com/dp/B0QUOTED";

  it("drops the product being quoted and anything unpriced", () => {
    const picked = pickSimilarProducts(
      [
        product({ id: "same", product_url: `${quoted}?ref=x` }),
        product({ id: "unpriced", unpriceable: true, total_ghs: null }),
        product({ id: "keep", product_url: "https://www.amazon.com/dp/B0OTHER" }),
      ],
      { excludeUrl: quoted, limit: 6 },
    );
    expect(picked.map((p) => p.id)).toEqual(["keep"]);
  });

  it("caps the rail at the limit it is given", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      product({ id: `p${index}`, product_url: `https://www.amazon.com/dp/B${index}` }),
    );
    expect(pickSimilarProducts(many, { excludeUrl: quoted, limit: 4 })).toHaveLength(4);
  });

  it("returns nothing when every hit is the product itself", () => {
    expect(
      pickSimilarProducts([product({ product_url: quoted })], {
        excludeUrl: quoted,
        limit: 6,
      }),
    ).toEqual([]);
  });
});
