import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://dev.tomame.test" }, extraction: {}, ebay: {} } }));
vi.mock("@/db/queries/catalog", () => ({ searchCatalogProducts: vi.fn() }));
vi.mock("@/features/catalog/services/catalog-budget", () => ({ budgetPeriodOf: vi.fn(), readJobBudget: vi.fn(), spendJobBudget: vi.fn() }));
vi.mock("@/features/catalog/services/catalog-search.service", () => ({ strikeLandedTotal: vi.fn() }));
vi.mock("@/features/catalog/services/catalog-vendors", () => ({ configuredSearchVendors: vi.fn(), fetchCatalogStoreSearch: vi.fn() }));
vi.mock("@/features/extraction/hub-destination", () => ({ hubDestinationFor: vi.fn(async () => ({ country: "US", zip: "10001" })) }));

import { listingFromEbaySummary } from "../services/finder-search.service";
import { isWeakSeller, postFilterListings, type FinderListing } from "../shortlist";
import { planStoreSearches } from "../stores";

const spec = { product: "PS5 Pro", searchQuery: "PlayStation 5 Pro console" };

describe("eBay's own search rows", () => {
  it("becomes a listing at the canonical item URL, with the seller's record", () => {
    const l = listingFromEbaySummary({
      itemId: "v1|226000000001|0",
      legacyItemId: "226000000001",
      title: "Sony PlayStation 5 Pro Console 2TB Brand New Sealed",
      price: { value: "1349.98", currency: "USD" },
      condition: "New",
      image: { imageUrl: "https://i.ebayimg.com/x.jpg" },
      seller: { username: "cardvaultkyle", feedbackPercentage: "100.0", feedbackScore: 812 },
    });
    expect(l).toMatchObject({
      store: "ebay",
      productUrl: "https://www.ebay.com/itm/226000000001",
      priceUsd: 1349.98,
      condition: "New",
      seller: "cardvaultkyle",
      sellerFeedback: { percent: 100, score: 812 },
      source: "live",
    });
  });

  it("has no price in another currency, and no listing without an id", () => {
    expect(listingFromEbaySummary({ legacyItemId: "226000000002", title: "x", price: { value: "10", currency: "GBP" } })?.priceUsd).toBeNull();
    expect(listingFromEbaySummary({ title: "x" })).toBeNull();
  });
});

describe("sellers", () => {
  const base: FinderListing = {
    id: "a", store: "ebay", title: "Sony PlayStation 5 Pro Console", productUrl: "https://www.ebay.com/itm/1", imageUrl: null,
    priceUsd: 1400, currency: "USD", condition: "New", seller: "s", source: "live",
  };

  it("sets aside a seller with no or poor feedback; unknown is not weak", () => {
    expect(isWeakSeller({ sellerFeedback: { percent: 0, score: 0 } })).toBe(true);
    expect(isWeakSeller({ sellerFeedback: { percent: 99.8, score: 5 } })).toBe(true);
    expect(isWeakSeller({ sellerFeedback: { percent: 96.5, score: 900 } })).toBe(true);
    expect(isWeakSeller({ sellerFeedback: { percent: 99.1, score: 300 } })).toBe(false);
    expect(isWeakSeller({ sellerFeedback: null })).toBe(false);
  });

  it("drops weak sellers with a reason, and keeps a live Amazon row the search left unpriced", () => {
    const out = postFilterListings(
      [
        { ...base, id: "weak", sellerFeedback: { percent: 0, score: 0 } },
        { ...base, id: "good", sellerFeedback: { percent: 100, score: 500 } },
        { ...base, id: "amz", store: "amazon", priceUsd: null, condition: null },
        { ...base, id: "cat", store: "amazon", priceUsd: null, condition: null, source: "catalogue" },
      ],
      spec,
      new Set(["ebay", "amazon"] as const),
    );
    expect(out.kept.map((l) => l.id)).toEqual(["good", "amz"]);
    expect(out.dropped).toEqual({ weak_seller: 1, no_price: 1 });
  });
});

describe("free store searches", () => {
  it("search eBay through its own API with no vendor key and no budget", () => {
    const plan = planStoreSearches(["amazon", "walmart", "ebay"], { scraperapi: true, zyte: false }, 1, new Set(["ebay"] as const));
    expect(plan.search).toEqual(["amazon", "ebay"]);
    expect(plan.skipped).toEqual([{ store: "walmart", reason: "budget" }]);
  });
});
