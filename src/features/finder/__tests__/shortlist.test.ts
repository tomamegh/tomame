import { describe, expect, it } from "vitest";

import type { CatalogStore } from "@/config/catalog";

import {
  applyShortlistOutput,
  dropDetails,
  isAccessoryFor,
  isClearlyOverBudget,
  isNotNew,
  isUnwantedMultipack,
  keywordMatches,
  postFilterListings,
  type FinderListing,
} from "../shortlist";

const spec = { product: "PS5 Slim Digital Edition", searchQuery: "PS5 Slim Digital Edition console" };

const listing = (over: Partial<FinderListing> = {}): FinderListing => ({
  id: over.id ?? "a",
  store: "amazon",
  title: "PlayStation 5 Slim Digital Edition Console",
  productUrl: `https://www.amazon.com/dp/${over.id ?? "a"}`,
  imageUrl: null,
  priceUsd: 449.99,
  currency: "USD",
  condition: null,
  seller: null,
  source: "live",
  ...over,
});

describe("isNotNew", () => {
  it.each([
    "PlayStation 5 Slim Digital (Renewed)",
    "PS5 Slim Digital - Refurbished",
    "Pre-Owned PS5 Slim",
    "PS5 Slim Open Box",
    "Used PS5 console",
    "PS5 Slim like new",
  ])("drops %s", (title) => {
    expect(isNotNew({ title, condition: null })).toBe(true);
  });

  it("drops a listing whose store condition is not new", () => {
    expect(isNotNew({ title: "PS5 Slim", condition: "Used" })).toBe(true);
    expect(isNotNew({ title: "PS5 Slim", condition: "Open box" })).toBe(true);
    expect(isNotNew({ title: "PS5 Slim", condition: "New (Other)" })).toBe(true);
    expect(isNotNew({ title: "PS5 Slim", condition: "Certified - Refurbished" })).toBe(true);
  });

  it("keeps new stock", () => {
    expect(isNotNew({ title: "PS5 Slim Digital", condition: null })).toBe(false);
    expect(isNotNew({ title: "PS5 Slim Digital", condition: "Brand New" })).toBe(false);
    expect(isNotNew({ title: "PS5 Slim Digital", condition: "New" })).toBe(false);
  });
});

describe("isAccessoryFor", () => {
  it("drops an accessory for the thing asked about", () => {
    expect(isAccessoryFor("Silicone Case for AirPods Pro 2", { product: "AirPods Pro 2", searchQuery: "AirPods Pro 2" })).toBe(true);
    expect(isAccessoryFor("Charging Stand compatible with PS5 controllers", spec)).toBe(true);
    expect(isAccessoryFor("Faceplate for PS5 Slim Digital", spec)).toBe(true);
  });

  it("keeps the item itself, including one that comes with a case", () => {
    expect(isAccessoryFor("PlayStation 5 Slim Digital Edition Console", spec)).toBe(false);
    expect(isAccessoryFor("Oraimo FreePods 4 earbuds with charging case", { product: "Oraimo earbuds", searchQuery: "oraimo earbuds" })).toBe(false);
  });

  it("keeps an accessory the customer asked for", () => {
    expect(isAccessoryFor("Charging Stand for PS5 controllers", { product: "PS5 controller charging stand", searchQuery: "ps5 controller charging stand" })).toBe(false);
  });
});

describe("isUnwantedMultipack", () => {
  it("drops packs nobody asked for, and keeps piece counts and asked-for packs", () => {
    expect(isUnwantedMultipack("Duracell AA batteries, 24-pack", { product: "AA batteries", searchQuery: "AA batteries" })).toBe(true);
    expect(isUnwantedMultipack("Shirt, pack of 3", { product: "white shirt", searchQuery: "white shirt" })).toBe(true);
    expect(isUnwantedMultipack("LEGO Star Wars set, 1,000 pieces", { product: "LEGO Star Wars", searchQuery: "lego star wars" })).toBe(false);
    expect(isUnwantedMultipack("Duracell AA batteries, 24-pack", { product: "AA batteries 24 pack", searchQuery: "AA batteries 24 pack" })).toBe(false);
    expect(isUnwantedMultipack("Socks, 1-pack", spec)).toBe(false);
  });
});

describe("postFilterListings", () => {
  const allowed = new Set<CatalogStore>(["amazon", "ebay", "walmart"]);

  it("keeps only new, priced items from stores we buy from, and counts what it dropped", () => {
    const { kept, dropped } = postFilterListings(
      [
        listing({ id: "ok" }),
        listing({ id: "etsy", store: "etsy" }),
        listing({ id: "renewed", title: "PS5 Slim Digital (Renewed)" }),
        listing({ id: "used", store: "ebay", condition: "Pre-owned" }),
        listing({ id: "case", title: "Skin for PS5 Slim Digital" }),
        listing({ id: "noprice", store: "ebay", priceUsd: null }),
        listing({ id: "pack", title: "PS5 Slim Digital 2-pack" }),
      ],
      spec,
      allowed,
    );
    expect(kept.map((l) => l.id)).toEqual(["ok"]);
    expect(dropped).toEqual({ store: 1, not_new: 2, accessory: 1, no_price: 1, multipack: 1 });
  });
});

describe("isClearlyOverBudget", () => {
  it("drops only a clear miss, never when either figure is unknown", () => {
    expect(isClearlyOverBudget(1200, 1000, 0.15)).toBe(true);
    expect(isClearlyOverBudget(1100, 1000, 0.15)).toBe(false);
    expect(isClearlyOverBudget(null, 1000, 0.15)).toBe(false);
    expect(isClearlyOverBudget(5000, null, 0.15)).toBe(false);
  });
});

describe("applyShortlistOutput (the model's half)", () => {
  const listings = [listing({ id: "a" }), listing({ id: "b" }), listing({ id: "c" }), listing({ id: "d" })];

  it("keeps the model's order, ignores ids it made up or repeated, and counts the rest as different items", () => {
    const out = applyShortlistOutput(
      { matches: ["c", "zzz", "a", "c"], rejected: [{ id: "b", reason: "accessory" }, { id: "a", reason: "not_new" }] },
      listings,
    );
    expect(out?.matches.map((l) => l.id)).toEqual(["c", "a"]);
    expect(out?.dropped).toEqual({ accessory: 1, wrong_item: 1 });
  });

  it("returns null for malformed output", () => {
    expect(applyShortlistOutput({ matches: "a" }, listings)).toBeNull();
    expect(applyShortlistOutput({ matches: ["a"], rejected: [{ id: "b", reason: "cheap" }] }, listings)).toBeNull();
    expect(applyShortlistOutput(null, listings)).toBeNull();
  });

  it("can only return listings it was given, so the code filters before it still hold", () => {
    const out = applyShortlistOutput({ matches: ["renewed-one"], rejected: [] }, listings);
    expect(out?.matches).toEqual([]);
  });
});

describe("keywordMatches (the fallback when the model fails)", () => {
  it("keeps only titles carrying every word of the search", () => {
    const out = keywordMatches({ searchQuery: "PS5 Slim Digital" }, [
      listing({ id: "yes", title: "Sony PS5 Slim Digital Edition" }),
      listing({ id: "no", title: "Sony PS5 Slim Disc Edition" }),
    ]);
    expect(out.map((l) => l.id)).toEqual(["yes"]);
  });
});

describe("dropDetails", () => {
  it("states the drops largest first, in plain words", () => {
    expect(dropDetails({ not_new: 25, accessory: 1, wrong_item: 3, store: 0 })).toEqual([
      "25 not sold as new",
      "3 are different items",
      "1 is an accessory or parts",
    ]);
  });
});
