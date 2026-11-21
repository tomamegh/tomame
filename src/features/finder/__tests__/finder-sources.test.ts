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
    expect(isWeakSeller({ sellerFeedback: { percent: 97.5, score: 900 } })).toBe(true);
    expect(isWeakSeller({ sellerFeedback: { percent: 100, score: 30 } })).toBe(true);
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

describe("listings that admit a catch", () => {
  it("sets aside damage, missing parts and 'read the description'", async () => {
    const { isRiskyListing } = await import("../shortlist");
    for (const t of [
      "Sony PlayStation 5 Pro (PS5 Pro) Console 4K UHDHDMI Black read description. New",
      "PS5 Pro Console NEW - damaged box",
      "PS5 Pro brand new, box has wear",
      "AirPods Pro 2 new missing charging cable",
      "Kindle Paperwhite new sold as-is",
      "PS5 Pro new minor scratches on top",
    ]) expect(isRiskyListing(t), t).toBe(true);
  });

  it("leaves ordinary new listings alone", async () => {
    const { isRiskyListing } = await import("../shortlist");
    for (const t of [
      "Sony PlayStation 5 Pro Console 2TB PS5 Brand New Sealed",
      "Apple iPhone 17 Pro Max 256GB, scratch-resistant Ceramic Shield",
      "Stanley Quencher H2.0 40oz tumbler",
      "LEGO The Missing Link building set",
    ]) expect(isRiskyListing(t), t).toBe(false);
  });
});

describe("Target's own search rows", () => {
  it("keep Target's product link and a single price; a price range is left for the store read", async () => {
    const { mapRedskySearch } = await import("@/features/extraction/resolvers/target-redsky");
    const rows = mapRedskySearch([
      {
        tcin: "85978609",
        price: { current_retail: 179.99 },
        item: {
          product_description: { title: "Apple AirPods Pro 3 Wireless Earbuds with Active Noise Cancellation" },
          enrichment: { buy_url: "https://www.target.com/p/ap2022-true-wireless-bluetooth-headphones/-/A-85978609", image_info: { primary_image: { url: "https://target.scene7.com/x" } } },
        },
      },
      { tcin: "1", price: { current_retail_min: 10, current_retail_max: 20 }, item: { product_description: { title: "Socks, assorted" } } },
      { tcin: "2", item: {} },
    ]);
    expect(rows).toEqual([
      { tcin: "85978609", title: "Apple AirPods Pro 3 Wireless Earbuds with Active Noise Cancellation", productUrl: "https://www.target.com/p/ap2022-true-wireless-bluetooth-headphones/-/A-85978609", imageUrl: "https://target.scene7.com/x", priceUsd: 179.99 },
      { tcin: "1", title: "Socks, assorted", productUrl: "https://www.target.com/p/-/A-1", imageUrl: null, priceUsd: null },
    ]);
  });

  it("searches eBay and Target for free, Amazon and Walmart within the paid allowance", () => {
    const plan = planStoreSearches(["amazon", "walmart", "ebay", "target"], { scraperapi: true, zyte: false }, 2, new Set(["ebay", "target"] as const));
    expect(plan).toEqual({ search: ["amazon", "walmart", "ebay", "target"], skipped: [] });
  });
});
