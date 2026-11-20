import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://dev.tomame.test" }, extraction: { anthropicApiKey: "k" } } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/errors", () => ({ isSchemaMissingError: () => false }));
vi.mock("@/db/queries/finder-runs", () => ({
  claimFinderRun: vi.fn(),
  completeFinderRun: vi.fn(),
  findRecentFinderRun: vi.fn(),
  getFinderRunById: vi.fn(),
  getFinderRunForViewer: vi.fn(),
  insertFinderRun: vi.fn(),
  listStalePendingFinderRuns: vi.fn(async () => []),
  reclaimStaleFinderRuns: vi.fn(async () => ({ touched: 0, failed: [] })),
  requeueFinderRun: vi.fn(),
  saveFinderProgress: vi.fn(async () => undefined),
  updateFinderRunContact: vi.fn(),
}));
vi.mock("@/db/queries/regions", () => ({ getRegionByCode: vi.fn(async () => ({ status: "live" })) }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn(async () => ({ whatsapp_number: "0594424746" })) }));
vi.mock("@/db/queries/profiles", () => ({ selectAccountProfile: vi.fn() }));
vi.mock("@/features/assisted/services/assisted.service", () => ({ createAssistedRequest: vi.fn() }));
vi.mock("@/features/extraction/extraction.service", () => ({
  extractPrepared: vi.fn(),
  getExtractionSnapshot: vi.fn(async () => null),
  prepareProductUrl: vi.fn(async (url: string) => ({ canonicalUrl: url, urlHash: url })),
}));
vi.mock("@/features/extraction/quote.service", () => ({ priceExtractionWith: vi.fn() }));
vi.mock("@/features/extraction/pay-gate", () => ({ payHoldOf: vi.fn(() => null) }));
vi.mock("@/features/pricing/freight-inspection", () => ({ freightCheckPending: () => false }));
vi.mock("@/features/pricing/services/pricing.service", () => ({
  loadPricingCalculator: vi.fn(async () => ({})),
  loadDisplayPricingCalculator: vi.fn(async () => ({})),
}));
vi.mock("@/features/quote-checks/services/quote-checks.service", () => ({ checksByExtraction: vi.fn(async () => new Map()) }));
vi.mock("../services/finder-ai.service", () => ({ understandRequest: vi.fn(), shortlistListings: vi.fn() }));
vi.mock("../services/finder-search.service", () => ({
  planFinderStores: vi.fn(),
  searchFinderStore: vi.fn(),
  searchFinderCatalogue: vi.fn(async () => []),
  estimateLandedGhs: vi.fn(async () => null),
}));
vi.mock("../services/finder-notify.service", () => ({
  notifyFinderFinished: vi.fn(async () => "sent"),
  finderRecipient: vi.fn(async () => null),
  finderRunPath: (id: string) => `/app/find/${id}`,
}));

import { claimFinderRun, completeFinderRun, findRecentFinderRun, getFinderRunById, insertFinderRun } from "@/db/queries/finder-runs";
import { extractPrepared } from "@/features/extraction/extraction.service";
import { payHoldOf } from "@/features/extraction/pay-gate";
import { priceExtractionWith } from "@/features/extraction/quote.service";
import type { PricingBreakdown } from "@/lib/pricing/calculator";

import { reduceFinderEvents, selectRankedCandidates } from "../state/reducer";
import { shortlistListings, understandRequest } from "../services/finder-ai.service";
import { notifyFinderFinished } from "../services/finder-notify.service";
import { FinderNotAdmittedError, runFinderJob, startFinderRun } from "../services/finder-run.service";
import { planFinderStores, searchFinderStore } from "../services/finder-search.service";
import type { FinderListing } from "../shortlist";
import type { FinderEvent } from "../types";

const RUN_ID = "1a2b3c4d-0000-4000-8000-000000000000";
const run = (over: Record<string, unknown> = {}) =>
  ({
    id: RUN_ID,
    user_id: "u1",
    session_id: null,
    query: "PS5 slim digital",
    query_key: "ps5 slim digital",
    budget_ghs: null,
    spec: null,
    status: "pending",
    events: [],
    result: null,
    email: null,
    notify_whatsapp: false,
    emailed_at: null,
    vendor_searches: 0,
    attempts: 0,
    started_at: null,
    finished_at: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  }) as never;

const listing = (id: string, title = "PlayStation 5 Slim Digital Edition"): FinderListing => ({
  id,
  store: "amazon",
  title,
  productUrl: `https://www.amazon.com/dp/${id}`,
  imageUrl: null,
  priceUsd: 449.99,
  currency: "USD",
  condition: null,
  seller: null,
  source: "live",
});

const breakdown = (total: number): PricingBreakdown =>
  ({
    pricing_method: "flat_rate",
    item_price_usd: 400,
    quantity: 1,
    subtotal_usd: 400,
    exchange_rate: 15,
    tax_percentage: 0.08,
    tax_usd: 32,
    value_fee_percentage: 0.04,
    value_fee_usd: 16,
    flat_rate_ghs: 300,
    total_ghs: total,
    total_pesewas: total * 100,
    fee_calculation_note: "Flat rate",
  }) as PricingBreakdown;

function settledEvents(): FinderEvent[] {
  const call = vi.mocked(completeFinderRun).mock.calls.at(-1)![0];
  return call.events;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFinderRunById).mockResolvedValue(run());
  vi.mocked(claimFinderRun).mockImplementation(async (_id, events) => run({ status: "running", events, started_at: new Date().toISOString() }));
  vi.mocked(completeFinderRun).mockImplementation(async (input) => run({ status: input.status, events: input.events }));
});

describe("runFinderJob", () => {
  it("ends as a calm no-match with a buyer hand-off when the model's reading is unusable", async () => {
    vi.mocked(understandRequest).mockResolvedValue(null);

    expect(await runFinderJob(RUN_ID)).toBe("no_match");
    const call = vi.mocked(completeFinderRun).mock.calls[0]![0];
    expect(call.status).toBe("no_match");
    const last = call.events.at(-1)!;
    expect(last).toMatchObject({ type: "nothing_found", whatsappText: expect.stringContaining("Ref F-1A2B3C4D") });
    expect(reduceFinderEvents(call.events).phase).toBe("nothing_found");
    expect(planFinderStores).not.toHaveBeenCalled();
    expect(notifyFinderFinished).toHaveBeenCalledTimes(1);
  });

  it("does nothing when another worker already claimed the run", async () => {
    vi.mocked(claimFinderRun).mockResolvedValue(null);
    expect(await runFinderJob(RUN_ID)).toBe("skipped");
    expect(understandRequest).not.toHaveBeenCalled();
  });

  it("prices the shortlist through the extraction chain and never makes an unconfirmed price best", async () => {
    vi.mocked(understandRequest).mockResolvedValue({ product: "PS5 Slim Digital", searchQuery: "PS5 Slim Digital", mustHaves: [], budgetGhs: null, newOnly: true, category: null });
    vi.mocked(planFinderStores).mockResolvedValue({ search: ["amazon", "ebay"], skipped: [{ store: "walmart", reason: "budget" }] });
    vi.mocked(searchFinderStore).mockImplementation(async (store) =>
      store === "amazon"
        ? { store, failed: false, listings: [listing("cheap"), listing("mid"), listing("renewed", "PS5 Slim Digital (Renewed)")] }
        : { store, failed: false, listings: [{ ...listing("ebay1"), store: "ebay" }] },
    );
    vi.mocked(shortlistListings).mockImplementation(async (_spec, listings) => ({
      matches: listings.filter((l) => l.id !== "renewed"),
      dropped: {},
    }));
    const extraction = (id: string) => ({ extraction_cache_id: `cache-${id}`, product: { price: 400 }, price_confidence: { level: "confirmed" } });
    vi.mocked(extractPrepared).mockImplementation(async (prepared) => extraction(String(prepared.canonicalUrl).split("/").pop()!) as never);
    const totals: Record<string, number> = { "cache-cheap": 7000, "cache-mid": 7600, "cache-ebay1": 7300 };
    vi.mocked(priceExtractionWith).mockImplementation(async (_calc, ex) => ({ pricing: breakdown(totals[(ex as { extraction_cache_id: string }).extraction_cache_id]!), reason: null }));
    // The cheapest one's price is not confirmed by the store.
    vi.mocked(payHoldOf).mockImplementation((input) =>
      (input.extraction as { extraction_cache_id?: string }).extraction_cache_id === "cache-cheap"
        ? { kind: "price_check", message: "Confirming", needs_staff: true }
        : null,
    );

    expect(await runFinderJob(RUN_ID)).toBe("done");
    const events = settledEvents();
    const state = reduceFinderEvents(events);
    expect(state.phase).toBe("result");
    expect(state.result?.bestId).toBe("ebay1");
    const ranked = selectRankedCandidates(state);
    expect(ranked.map((c) => [c.id, c.status])).toEqual([
      ["ebay1", "priced"],
      ["mid", "priced"],
      ["cheap", "confirming"],
    ]);
    expect(ranked[0]!.extractionCacheId).toBe("cache-ebay1");

    // Narration says what happened: the stores searched, the one skipped and why.
    const search = events.find((e) => e.type === "step_done" && e.step === "search");
    expect(search).toMatchObject({ summary: "Searched Amazon and eBay · 4 listings" });
    expect((search as { details: string[] }).details).toContain("Walmart not searched: this month's search allowance is used up");
    const shortlist = events.find((e) => e.type === "step_done" && e.step === "shortlist");
    expect(shortlist).toMatchObject({ summary: "3 of 4 are the exact item", details: ["1 not sold as new"] });
    expect(events.find((e) => e.type === "step_done" && e.step === "price")).toMatchObject({ summary: "2 of 3 prices confirmed. Still confirming one with the store." });
  });

  it("requeues a run that threw on its first try", async () => {
    vi.mocked(understandRequest).mockRejectedValue(new Error("boom"));
    expect(await runFinderJob(RUN_ID)).toBe("requeued");
    expect(completeFinderRun).not.toHaveBeenCalled();
  });
});

describe("startFinderRun", () => {
  const viewer = { userId: "u1", sessionId: null };

  it("returns the same request's run from the last 24 h without counting it", async () => {
    vi.mocked(findRecentFinderRun).mockResolvedValue(run({ status: "done" }));
    const admit = vi.fn(async () => true);
    const out = await startFinderRun(viewer, { query: " PS5  slim digital ", budgetGhs: null, email: null, notifyWhatsapp: false }, admit);
    expect(out.reused).toBe(true);
    expect(admit).not.toHaveBeenCalled();
    expect(vi.mocked(findRecentFinderRun).mock.calls[0]![1]).toBe("ps5 slim digital");
  });

  it("refuses a fresh run the rate limit does not admit, before writing anything", async () => {
    vi.mocked(findRecentFinderRun).mockResolvedValue(null);
    await expect(startFinderRun(viewer, { query: "PS5", budgetGhs: null, email: null, notifyWhatsapp: false }, async () => false)).rejects.toBeInstanceOf(
      FinderNotAdmittedError,
    );
    expect(insertFinderRun).not.toHaveBeenCalled();
  });

  it("writes a fresh run that already says it has started", async () => {
    vi.mocked(findRecentFinderRun).mockResolvedValue(null);
    vi.mocked(insertFinderRun).mockImplementation(async (input) => run({ events: input.events }));
    await startFinderRun(viewer, { query: "PS5", budgetGhs: 9000, email: null, notifyWhatsapp: true }, async () => true);
    expect(vi.mocked(insertFinderRun).mock.calls[0]![0]).toMatchObject({
      queryKey: "ps5 | 9000",
      notifyWhatsapp: true,
      events: [{ type: "run_started", at: 0, query: "PS5", budgetGhs: 9000 }],
    });
  });
});

describe("which matches are read at the store", () => {
  const l = (id: string, priceUsd: number | null) =>
    ({ id, store: "amazon", title: id, productUrl: id, imageUrl: null, priceUsd, currency: "USD", condition: null, seller: null, source: "live" }) as const;

  it("keeps a slot for the best unpriced match", async () => {
    const { pickPriceCandidates } = await import("../services/finder-run.service");
    expect(pickPriceCandidates([l("a", 10), l("b", 11), l("c", 12), l("x", null), l("y", null)], 3).map((c) => c.id)).toEqual(["a", "b", "x"]);
    expect(pickPriceCandidates([l("a", 10), l("x", null), l("y", null)], 3).map((c) => c.id)).toEqual(["a", "x", "y"]);
    expect(pickPriceCandidates([l("a", 10), l("b", 11), l("c", 12), l("d", 13)], 3).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

