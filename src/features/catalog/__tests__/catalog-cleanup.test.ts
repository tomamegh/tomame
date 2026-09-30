import { describe, it, expect } from "vitest";
import { cleanupReasonFor, type CleanupRow, type CleanupRules } from "../services/catalog-cleanup";

const NOW = new Date("2026-09-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const rules: CleanupRules = {
  now: NOW,
  staleAfterDays: 30,
  unpricedGraceHours: 48,
  maxEnrichAttempts: 2,
  enrichableStores: ["amazon", "ebay", "walmart"],
  maxPlausiblePriceUsd: 100_000,
  maxEbayTitleChars: 80,
};

function row(o: Partial<CleanupRow> = {}): CleanupRow {
  return {
    store: "amazon",
    title: "Office chair",
    product_url: "https://www.amazon.com/dp/B000000001",
    image_url: "https://m.media-amazon.com/images/I/x.jpg",
    price_usd: 99,
    landed_ghs: 2000,
    landed_priced_at: hoursAgo(1),
    landed_decline: null,
    enrich_attempts: 0,
    first_seen_at: hoursAgo(5),
    last_seen_at: hoursAgo(2),
    dup_rank: 1,
    known_weight_miss: false,
    ...o,
  };
}

describe("cleanupReasonFor", () => {
  it("keeps a priced row seen recently", () => {
    expect(cleanupReasonFor(row(), rules)).toBeNull();
  });

  it("deletes junk whatever its price", () => {
    expect(cleanupReasonFor(row({ title: "  " }), rules)).toBe("junk_title");
    expect(cleanupReasonFor(row({ product_url: "http://www.amazon.com/dp/B1" }), rules)).toBe("junk_url");
    expect(cleanupReasonFor(row({ image_url: "http://img.example/x.jpg" }), rules)).toBe("junk_image");
    expect(cleanupReasonFor(row({ image_url: null }), rules)).toBeNull();
    expect(cleanupReasonFor(row({ dup_rank: 2 }), rules)).toBe("duplicate");
    expect(cleanupReasonFor(row({ price_usd: 1_995_202_244 }), rules)).toBe("implausible");
    expect(cleanupReasonFor(row({ store: "ebay", title: "x".repeat(81) }), rules)).toBe("implausible");
    // Amazon titles are legitimately long.
    expect(cleanupReasonFor(row({ title: "x".repeat(200) }), rules)).toBeNull();
  });

  it("deletes a row with no store price", () => {
    expect(cleanupReasonFor(row({ price_usd: null, landed_ghs: null, landed_decline: "no_price" }), rules)).toBe("no_price");
    expect(cleanupReasonFor(row({ price_usd: 0 }), rules)).toBe("no_price");
  });

  it("deletes a listing the scraper has not re-read in 30 days, priced or not", () => {
    expect(cleanupReasonFor(row({ last_seen_at: hoursAgo(31 * 24) }), rules)).toBe("stale");
    expect(cleanupReasonFor(row({ last_seen_at: hoursAgo(29 * 24) }), rules)).toBeNull();
  });

  it("keeps a row the landed-price refresh has not reached yet, or struck before reasons existed", () => {
    expect(cleanupReasonFor(row({ landed_ghs: null, landed_priced_at: null, first_seen_at: hoursAgo(100) }), rules)).toBeNull();
    expect(cleanupReasonFor(row({ landed_ghs: null, landed_decline: null, first_seen_at: hoursAgo(100) }), rules)).toBeNull();
  });

  it("deletes an unpriceable row once the 48h grace has passed", () => {
    const unpriceable = { landed_ghs: null, landed_decline: "unpriceable" as const };
    expect(cleanupReasonFor(row({ ...unpriceable, first_seen_at: hoursAgo(47) }), rules)).toBeNull();
    expect(cleanupReasonFor(row({ ...unpriceable, first_seen_at: hoursAgo(49) }), rules)).toBe("unpriceable");
  });

  it("gives a weight-declined row every enrichment attempt, then deletes it", () => {
    const needsWeight = { landed_ghs: null, landed_decline: "needs_weight" as const };
    // Weeks old (the prod backlog), but the enrichment has tries left: kept.
    expect(cleanupReasonFor(row({ ...needsWeight, enrich_attempts: 0, first_seen_at: hoursAgo(24 * 20) }), rules)).toBeNull();
    expect(cleanupReasonFor(row({ ...needsWeight, enrich_attempts: 1, first_seen_at: hoursAgo(100) }), rules)).toBeNull();
    expect(cleanupReasonFor(row({ ...needsWeight, enrich_attempts: 2, first_seen_at: hoursAgo(3) }), rules)).toBe("weight_not_found");
  });

  it("deletes a re-scraped copy of a product already known to have no weight, after the grace", () => {
    const miss = row({ landed_ghs: null, landed_decline: "needs_weight", known_weight_miss: true });
    expect(cleanupReasonFor({ ...miss, first_seen_at: hoursAgo(47) }, rules)).toBeNull();
    expect(cleanupReasonFor({ ...miss, first_seen_at: hoursAgo(49) }, rules)).toBe("weight_not_found");
  });

  it("treats a weight-declined row of a store the enrichment cannot fetch as unpriceable", () => {
    const etsy = row({ store: "etsy", product_url: "https://www.etsy.com/listing/1", landed_ghs: null, landed_decline: "needs_weight" });
    expect(cleanupReasonFor({ ...etsy, first_seen_at: hoursAgo(47) }, rules)).toBeNull();
    expect(cleanupReasonFor({ ...etsy, first_seen_at: hoursAgo(49) }, rules)).toBe("weight_not_found");
    expect(cleanupReasonFor({ ...etsy, first_seen_at: hoursAgo(49) }, { ...rules, enrichableStores: ["etsy"] })).toBeNull();
  });
});
