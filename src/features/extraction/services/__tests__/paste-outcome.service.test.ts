import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/assisted-requests", () => ({
  findOpenAssistedRequest: vi.fn(async () => null),
  insertPasteAssistedRequest: vi.fn(async () => ({ id: "a1" })),
}));
vi.mock("@/db/queries/catalog", () => ({ findCatalogProductForPaste: vi.fn(async () => null) }));
vi.mock("@/db/queries/extraction-cache", () => ({
  getExtractionById: vi.fn(async () => null),
  getQuoteFacts: vi.fn(async () => new Map()),
  upsertExtractionCache: vi.fn(async () => "cache-from-catalog"),
}));
vi.mock("@/db/queries/extraction-requests", () => ({
  listUnsettledPastes: vi.fn(async () => []),
  readyFromCache: vi.fn(async () => undefined),
  setPasteOutcome: vi.fn(async () => undefined),
}));

import { insertPasteAssistedRequest } from "@/db/queries/assisted-requests";
import { findCatalogProductForPaste } from "@/db/queries/catalog";
import { getQuoteFacts, upsertExtractionCache } from "@/db/queries/extraction-cache";
import { readyFromCache, setPasteOutcome, type ExtractionJobRow } from "@/db/queries/extraction-requests";
import { catalogResult, pricedFromOf, settlePasteOutcome } from "../paste-outcome.service";
import { outcomeClock, quoteExpiresAt } from "../paste-quote-clock";

const NOW = new Date("2026-11-22T12:00:00Z");

const row = (over: Partial<ExtractionJobRow> = {}): ExtractionJobRow => ({
  id: "req-1",
  url_hash: "hash-1",
  product_url: "https://www.amazon.com/dp/B0CHWR32T7",
  extraction_cache_id: null,
  created_at: "2026-11-22T11:58:00Z",
  updated_at: "2026-11-22T11:59:00Z",
  user_id: "u1",
  session_id: null,
  status: "failed",
  attempts: 2,
  started_at: null,
  finished_at: "2026-11-22T11:59:00Z",
  error: "We could not read that page.",
  outcome: null,
  outcome_at: null,
  ...over,
});

const CATALOG = {
  id: "cat-1",
  store: "amazon",
  external_id: "B0CHWR32T7",
  product_url: "https://www.amazon.com/dp/B0CHWR32T7",
  title: "Apple AirPods Pro 2",
  image_url: "https://m.media-amazon.com/x.jpg",
  price_usd: 189.99,
  currency: "USD",
  category: "Headphones",
  weight_lbs: 0.5,
  landed_ghs: 2900,
  last_seen_at: "2026-11-11T08:00:00Z",
  raw: null,
};

beforeEach(() => vi.clearAllMocks());

describe("the 24-hour clock", () => {
  it("never extends a priced quote inside its window", () => {
    const priced = { outcome: "priced" as const, outcome_at: "2026-11-22T02:00:00Z" };
    expect(outcomeClock(priced, "priced", NOW)).toBe("2026-11-22T02:00:00Z");
    expect(quoteExpiresAt(priced)).toBe("2026-11-23T02:00:00.000Z");
  });

  it("starts afresh after the window, and for anything that was not priced", () => {
    expect(outcomeClock({ outcome: "priced", outcome_at: "2026-11-20T02:00:00Z" }, "priced", NOW)).toBe(NOW.toISOString());
    expect(outcomeClock({ outcome: "manual_quote", outcome_at: "2026-11-22T11:00:00Z" }, "priced_by_staff", NOW)).toBe(NOW.toISOString());
    expect(quoteExpiresAt({ outcome: "manual_quote", outcome_at: "2026-11-22T11:00:00Z" })).toBeNull();
  });
});

describe("settlePasteOutcome", () => {
  it("records a live price as priced", async () => {
    vi.mocked(getQuoteFacts).mockResolvedValueOnce(new Map([["c1", { usable: true, priced: true, unavailable: false, title: "x" }]]));
    const out = await settlePasteOutcome(row({ status: "ready", extraction_cache_id: "c1" }), { status: "ready", extractionCacheId: "c1" }, NOW);
    expect(out).toEqual({ status: "ready", extractionCacheId: "c1" });
    expect(setPasteOutcome).toHaveBeenCalledWith("req-1", "priced", NOW.toISOString());
    expect(insertPasteAssistedRequest).not.toHaveBeenCalled();
  });

  it("answers a failed read from the catalogue's last check of the same product", async () => {
    vi.mocked(findCatalogProductForPaste).mockResolvedValueOnce(CATALOG);
    const out = await settlePasteOutcome(row(), { status: "failed" }, NOW);
    expect(findCatalogProductForPaste).toHaveBeenCalledWith({ urlHash: "hash-1", store: "amazon", externalId: "B0CHWR32T7" });
    expect(out).toEqual({ status: "ready", extractionCacheId: "cache-from-catalog" });
    expect(readyFromCache).toHaveBeenCalledWith("req-1", "cache-from-catalog");
    expect(setPasteOutcome).toHaveBeenCalledWith("req-1", "priced_from_cache", NOW.toISOString());
    const written = vi.mocked(upsertExtractionCache).mock.calls[0]![0];
    expect(written.complete).toBe(true);
    expect(pricedFromOf(written.result)).toEqual({ kind: "catalog", catalog_product_id: "cat-1", checked_at: "2026-11-11T08:00:00Z" });
  });

  it("will not price from a catalogue row the engine could not price", async () => {
    vi.mocked(findCatalogProductForPaste).mockResolvedValueOnce({ ...CATALOG, landed_ghs: null });
    const out = await settlePasteOutcome(row(), { status: "failed" }, NOW);
    expect(out).toEqual({ status: "failed" });
    expect(upsertExtractionCache).not.toHaveBeenCalled();
  });

  it("opens a buyer task when nothing can price it, and never starts the quote clock", async () => {
    const out = await settlePasteOutcome(row({ product_url: "https://www.digitalstorm.com/configurator.asp" }), { status: "failed" }, NOW);
    expect(out).toEqual({ status: "failed" });
    expect(insertPasteAssistedRequest).toHaveBeenCalledWith(expect.objectContaining({ extractionRequestId: "req-1", userId: "u1" }));
    expect(setPasteOutcome).toHaveBeenCalledWith("req-1", "manual_quote", NOW.toISOString());
  });

  it("treats a read with no price like a failure", async () => {
    vi.mocked(getQuoteFacts).mockResolvedValueOnce(new Map([["c1", { usable: true, priced: false, unavailable: false, title: "x" }]]));
    await settlePasteOutcome(row({ status: "ready", extraction_cache_id: "c1" }), { status: "ready", extractionCacheId: "c1" }, NOW);
    expect(setPasteOutcome).toHaveBeenCalledWith("req-1", "manual_quote", NOW.toISOString());
  });
});

describe("catalogResult", () => {
  it("is a complete USD product that says it is the last checked price", () => {
    const result = catalogResult(CATALOG, NOW);
    expect(result.extraction_success).toBe(true);
    expect(result.product).toMatchObject({ price: 189.99, currency: "USD", category: "Headphones", weight_lbs: 0.5 });
    expect(result.messages[0]).toMatch(/last checked on 11 Nov/);
  });
});
