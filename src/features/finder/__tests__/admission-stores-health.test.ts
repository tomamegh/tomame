import { describe, expect, it } from "vitest";

import { RATE_LIMIT } from "@/config/security";

import { finderLimitMessage, finderRateLimit } from "../admission";
import { buildFinderHealth, finderHealthLine } from "../health";
import type { FinderListing } from "../shortlist";
import { finderAllowedStores, mergeListings, pickSearchStores, planStoreSearches } from "../stores";

describe("finderRateLimit", () => {
  it("keys a signed-in customer by user and a visitor by IP, with their own day budgets", () => {
    expect(finderRateLimit("user:u1", true)).toEqual({ key: "finder:user:u1", config: RATE_LIMIT.finderUser });
    expect(finderRateLimit("ip:1.2.3.4", false)).toEqual({ key: "finder:ip:1.2.3.4", config: RATE_LIMIT.finderVisitor });
    expect(RATE_LIMIT.finderUser).toEqual({ windowMs: 86_400_000, maxRequests: 5 });
    expect(RATE_LIMIT.finderVisitor).toEqual({ windowMs: 86_400_000, maxRequests: 2 });
  });

  it("offers a next step in the refusal", () => {
    expect(finderLimitMessage(false)).toContain("Sign in");
    expect(finderLimitMessage(true)).toContain("Paste a product link");
  });
});

describe("stores", () => {
  it("offers only live US stores, and none when the US lane is closed", () => {
    const allowed = finderAllowedStores(true);
    expect([...allowed].sort()).toEqual(["amazon", "ebay", "etsy", "nike", "walmart"]);
    expect(finderAllowedStores(false).size).toBe(0);
  });

  it("searches Amazon, Walmart and eBay by default; Nike and Etsy only when named", () => {
    const allowed = finderAllowedStores(true);
    expect(pickSearchStores("PS5 slim", allowed)).toEqual(["amazon", "walmart", "ebay"]);
    expect(pickSearchStores("Nike Air Max 90 size 42", allowed)).toEqual(["amazon", "walmart", "ebay", "nike"]);
    expect(pickSearchStores("handmade kente bag", allowed)).toEqual(["amazon", "walmart", "ebay", "etsy"]);
    expect(pickSearchStores("PS5 slim", new Set(["ebay"]))).toEqual(["ebay"]);
  });

  it("skips a store when its vendor key is missing or the month's budget is spent", () => {
    const configured = { scraperapi: true, zyte: false };
    expect(planStoreSearches(["amazon", "walmart", "ebay", "nike"], configured, 2)).toEqual({
      search: ["amazon", "walmart"],
      skipped: [
        { store: "ebay", reason: "budget" },
        { store: "nike", reason: "no_key" },
      ],
    });
    expect(planStoreSearches(["amazon"], { scraperapi: false, zyte: false }, 10).skipped).toEqual([{ store: "amazon", reason: "no_key" }]);
  });

  it("merges catalogue and live rows for one product, live first, stores taking turns", () => {
    const l = (id: string, store: FinderListing["store"], source: FinderListing["source"], url = id): FinderListing => ({
      id,
      store,
      title: id,
      productUrl: `https://x.test/${url}`,
      imageUrl: null,
      priceUsd: 1,
      currency: "USD",
      condition: null,
      seller: null,
      source,
    });
    const merged = mergeListings(
      [l("a1", "amazon", "live"), l("a2", "amazon", "live"), l("a3", "amazon", "live"), l("e1", "ebay", "live")],
      [l("cat-a1", "amazon", "catalogue", "a1"), l("w1", "walmart", "catalogue")],
      5,
    );
    expect(merged.map((x) => x.id)).toEqual(["a1", "e1", "w1", "a2", "a3"]);
  });
});

describe("finder health", () => {
  it("counts the day's runs, the no-match rate, the average duration and the searches", () => {
    const at = (s: number) => new Date(Date.UTC(2026, 10, 20, 10, 0, s)).toISOString();
    const h = buildFinderHealth(
      [
        { status: "done", vendor_searches: 3, started_at: at(0), finished_at: at(40) },
        { status: "done", vendor_searches: 3, started_at: at(0), finished_at: at(60) },
        { status: "no_match", vendor_searches: 2, started_at: at(0), finished_at: at(20) },
        { status: "failed", vendor_searches: 0, started_at: at(0), finished_at: at(100) },
        { status: "running", vendor_searches: 1, started_at: at(0), finished_at: null },
      ],
      { used: 140, cap: 300 },
    );
    expect(h).toMatchObject({ runs: 5, done: 2, noMatch: 1, failed: 1, open: 1, noMatchRate: 0.25, avgSeconds: 55, searches24h: 9 });
    expect(finderHealthLine(h)).toBe(
      "Price finder (24 h): 5 runs, 2 found, 1 no match (25%), 1 failed, 1 still running; average 55 s; store searches 9 today, 140 of 300 this month.",
    );
    expect(finderHealthLine(buildFinderHealth([], { used: 0, cap: 20 }))).toBe("Price finder (24 h): no runs. Store searches this month: 0 of 20.");
  });
});
