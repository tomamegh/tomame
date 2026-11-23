import { describe, expect, it } from "vitest";

import type { CatalogStore } from "@/config/catalog";

import {
  applyShortlistOutput,
  dropDetails,
  isAccessoryFor,
  isCarrierLocked,
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

  it("offers what the shopper almost certainly means when nothing is literally it (Kirkland beard spray)", () => {
    const out = applyShortlistOutput(
      {
        matches: [],
        rejected: [{ id: "a", reason: "wrong_item" }],
        likely_meant: { ids: ["c", "zzz", "b"], product: "Kirkland Minoxidil 5% for men", reason: "Kirkland's beard growth product is Minoxidil 5%." },
      },
      listings,
    );
    expect(out?.matches).toEqual([]);
    expect(out?.likely?.listings.map((l) => l.id)).toEqual(["c", "b"]);
    expect(out?.likely?.product).toBe("Kirkland Minoxidil 5% for men");
  });

  it("ignores likely_meant when there are exact matches, or when its ids are unknown", () => {
    const meant = { ids: ["b"], product: "Something else", reason: "A guess." };
    expect(applyShortlistOutput({ matches: ["a"], rejected: [], likely_meant: meant }, listings)?.likely).toBeNull();
    expect(applyShortlistOutput({ matches: [], rejected: [], likely_meant: { ...meant, ids: ["zzz"] } }, listings)?.likely).toBeNull();
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

describe("isCarrierLocked", () => {
  const spec = { product: "iPhone 17 Pro", searchQuery: "iPhone 17 Pro unlocked" };
  it("drops a phone tied to a US carrier, which would not take a Ghanaian SIM", () => {
    expect(isCarrierLocked("New T-Mobile Apple iPhone 17 Pro 256GB Deep Blue MG7M4LL/A", spec)).toBe(true);
    expect(isCarrierLocked("Verizon iPhone 17 Pro 256GB Cosmic Orange", spec)).toBe(true);
    expect(isCarrierLocked("AT&T iPhone 17 Pro 256GB Cosmic Orange", spec)).toBe(true);
    expect(isCarrierLocked("Straight Talk Apple iPhone 17 Pro, 256GB, Prepaid", spec)).toBe(true);
  });

  it("keeps unlocked phones, other products, and a carrier the customer asked for", () => {
    expect(isCarrierLocked("Apple iPhone 17 Pro 256GB Unlocked (works with Verizon, AT&T, T-Mobile)", spec)).toBe(false);
    expect(isCarrierLocked("Apple iPhone 17 Pro 256GB Factory Unlocked", spec)).toBe(false);
    expect(isCarrierLocked("JBL Flip 6 speaker with bass boost", spec)).toBe(false);
    expect(isCarrierLocked("Watt meter for solar panels", spec)).toBe(false);
    expect(isCarrierLocked("Verizon iPhone 17 Pro", { product: "Verizon iPhone 17 Pro", searchQuery: "verizon iphone 17 pro" })).toBe(false);
  });

  it("is counted as its own drop reason", () => {
    const l = (id: string, title: string) => ({ id, store: "ebay" as const, title, productUrl: `https://www.ebay.com/itm/${id}`, imageUrl: null, priceUsd: 999, currency: "USD", condition: "New", seller: null, source: "live" as const });
    const out = postFilterListings([l("1", "Verizon iPhone 17 Pro"), l("2", "Apple iPhone 17 Pro Unlocked")], spec, new Set(["ebay"] as const));
    expect(out.kept.map((k) => k.id)).toEqual(["2"]);
    expect(out.dropped).toEqual({ carrier_locked: 1 });
  });
});
