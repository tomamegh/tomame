import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Every data dependency is stubbed, so nothing in this file reaches Supabase,
// a cookie store, or the pricing engine.
const fakeClient = { __brand: "supabase" };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeClient),
}));
vi.mock("@/features/auth/services/auth.service", () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/db/queries/orders", () => ({
  countMovingOrders: vi.fn(),
  getRecentOrdersForUser: vi.fn(),
}));
vi.mock("@/db/queries/assisted-requests", () => ({
  listOpenAssistedRequestsByUrl: vi.fn(async () => new Map()),
}));
vi.mock("@/db/queries/extraction-requests", () => ({
  getLatestExtractionRequest: vi.fn(),
}));
vi.mock("@/db/queries/extraction-cache", () => ({
  getExtractionById: vi.fn(),
  getCachedExtractionByHash: vi.fn(),
}));
vi.mock("@/db/queries/regions", () => ({ listRegions: vi.fn() }));
// The freight-box card reads the open bag; the bag service reaches Supabase at
// module scope, so it is stubbed like every other data dependency here.
vi.mock("@/features/bag/services/bag.service", () => ({ getBag: vi.fn(async () => null) }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn() }));
vi.mock("@/features/watches/services/watches.service", () => ({
  listWatches: vi.fn(async () => ({ watches: [], watching_count: 0 })),
}));
vi.mock("@/features/quotes/services/quote-constants.service", () => {
  class QuoteConstantsMissingError extends Error {}
  return {
    QuoteConstantsMissingError,
    loadQuoteConstants: vi.fn(async () => ({ rate_lock_hours: 24, purchase_lead_days_min: 1, purchase_lead_days_max: 3 })),
  };
});
// Home prices the receipt through the quotes service's never-mint entry point.
vi.mock("@/features/quotes/services/quote-lock.service", () => ({
  priceUnderExistingLock: vi.fn(),
  applyRateLock: vi.fn(),
}));

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import {
  countMovingOrders,
  getRecentOrdersForUser,
  type RecentOrderRow,
} from "@/db/queries/orders";
import {
  getLatestExtractionRequest,
  type ExtractionRequestRow,
} from "@/db/queries/extraction-requests";
import {
  getCachedExtractionByHash,
  getExtractionById,
} from "@/db/queries/extraction-cache";
import { listRegions, type RegionRow } from "@/db/queries/regions";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { applyRateLock, priceUnderExistingLock } from "@/features/quotes/services/quote-lock.service";
import { loadQuoteConstants, QuoteConstantsMissingError } from "@/features/quotes/services/quote-constants.service";
import { logger } from "@/lib/logger";

import { isSchemaMissingError } from "@/lib/supabase/errors";
import {
  HOME_JOURNEY_LIMIT,
  getHomeView,
  timeOfDayFor,
} from "../services/home.service";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function order(overrides: Record<string, unknown> = {}): RecentOrderRow {
  return {
    id: "order-1",
    product_name: "Oraimo BoomPop N",
    product_url: "https://www.amazon.com/dp/B0TEST",
    status: "in_transit",
    pricing: { total_ghs: 5041.16 },
    estimated_delivery_date: "2026-09-19",
    created_at: "2026-09-10T10:00:00.000Z",
    ...overrides,
  } as unknown as RecentOrderRow;
}

function paste(overrides: Record<string, unknown> = {}): ExtractionRequestRow {
  return {
    id: "req-1",
    url_hash: "hash-1",
    product_url: "https://www.amazon.com/dp/B0TEST",
    extraction_cache_id: "cache-1",
    created_at: "2026-09-12T09:00:00.000Z",
    updated_at: "2026-09-12T09:30:00.000Z",
    ...overrides,
  } as unknown as ExtractionRequestRow;
}

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      title: "Oraimo BoomPop N",
      image: "https://img.example/boompop.jpg",
      price: 298,
      currency: "USD",
    },
    ...overrides,
  };
}

/** The three lanes migrations 036/037 seed. */
function seededRegions(): RegionRow[] {
  const base = {
    hub_city: null,
    store_names: [],
    tag_names: [],
    blurb: null,
    photo_key: null,
    departure_weekday: null,
    departure_cutoff_hours: 24,
  };
  return [
    {
      ...base,
      code: "USA",
      name: "United States",
      status: "live",
      transit_days_min: 14,
      transit_days_max: 18,
      sort_order: 1,
    },
    {
      ...base,
      code: "UK",
      name: "United Kingdom",
      status: "soon",
      transit_days_min: null,
      transit_days_max: null,
      sort_order: 2,
    },
    {
      ...base,
      code: "CHINA",
      name: "China",
      status: "soon",
      transit_days_min: null,
      transit_days_max: null,
      sort_order: 3,
    },
  ];
}

function signedIn(profile: { first_name?: string } = { first_name: "Kwame" }) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "user-1",
    profile,
    // The service only reads `id` and `profile.first_name`.
  } as unknown as Awaited<ReturnType<typeof getAuthenticatedUser>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(countMovingOrders).mockResolvedValue(0);
  vi.mocked(getRecentOrdersForUser).mockResolvedValue([]);
  vi.mocked(getLatestExtractionRequest).mockResolvedValue(null);
  vi.mocked(getExtractionById).mockResolvedValue(null);
  vi.mocked(getCachedExtractionByHash).mockResolvedValue(null);
  vi.mocked(priceUnderExistingLock).mockResolvedValue({ pricing: null, reason: null });
  vi.mocked(listRegions).mockResolvedValue(seededRegions());
  vi.mocked(getSiteSettingsMap).mockResolvedValue({
    whatsapp_number: "+233 24 555 0192",
    support_hours: "8am–10pm",
  });
});

// ── Session ──────────────────────────────────────────────────────────────────

describe("getHomeView — session", () => {
  it("returns null when there is no signed-in customer", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect(await getHomeView()).toBeNull();
    expect(getRecentOrdersForUser).not.toHaveBeenCalled();
  });

  it("reads through the cookie-bound client, scoped to the session user", async () => {
    signedIn();
    await getHomeView();
    expect(countMovingOrders).toHaveBeenCalledWith(fakeClient, "user-1");
    expect(getLatestExtractionRequest).toHaveBeenCalledWith(
      fakeClient,
      "user-1",
    );
  });
});

// ── Greeting ─────────────────────────────────────────────────────────────────

describe("getHomeView — greeting", () => {
  it("carries the first name and the live moving count", async () => {
    signedIn({ first_name: "Kwame" });
    vi.mocked(countMovingOrders).mockResolvedValue(2);

    const view = await getHomeView();

    expect(view?.greeting.firstName).toBe("Kwame");
    expect(view?.greeting.movingCount).toBe(2);
  });

  it("reports a missing or blank first name as null, not an empty string", async () => {
    signedIn({});
    expect((await getHomeView())?.greeting.firstName).toBeNull();

    signedIn({ first_name: "   " });
    expect((await getHomeView())?.greeting.firstName).toBeNull();
  });
});

describe("timeOfDayFor", () => {
  it("splits the Accra day at noon and 17:00 (GMT year-round)", () => {
    expect(timeOfDayFor(new Date("2026-09-12T00:00:00Z"))).toBe("Morning");
    expect(timeOfDayFor(new Date("2026-09-12T11:59:00Z"))).toBe("Morning");
    expect(timeOfDayFor(new Date("2026-09-12T12:00:00Z"))).toBe("Afternoon");
    expect(timeOfDayFor(new Date("2026-09-12T16:59:00Z"))).toBe("Afternoon");
    expect(timeOfDayFor(new Date("2026-09-12T17:00:00Z"))).toBe("Evening");
    expect(timeOfDayFor(new Date("2026-09-12T23:59:00Z"))).toBe("Evening");
  });
});

// ── Journeys ─────────────────────────────────────────────────────────────────

describe("getHomeView — journeys", () => {
  it("derives stage, ETA and total from the order row", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockResolvedValue([order()]);

    const journey = (await getHomeView())?.journeys[0];

    expect(journey?.productName).toBe("Oraimo BoomPop N");
    expect(journey?.status).toBe("in_transit");
    expect(journey?.stage.label).toBe("In the air");
    expect(journey?.stage.trackPercent).toBe(75);
    expect(journey?.stage.etaDate).toBe("2026-09-19");
    expect(journey?.totalGhs).toBe(5041.16);
  });

  it("leaves the ETA null when the admin has not set one", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockResolvedValue([
      order({ status: "processing", estimated_delivery_date: null }),
    ]);

    const journey = (await getHomeView())?.journeys[0];
    expect(journey?.stage.etaDate).toBeNull();
    expect(journey?.stage.hint).toBe("Date set when it ships");
  });

  it("drops cancelled orders — they have no position on the track", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockResolvedValue([
      order({ id: "a", status: "cancelled" }),
      order({ id: "b", status: "paid" }),
    ]);

    const journeys = (await getHomeView())?.journeys ?? [];
    expect(journeys.map((j) => j.id)).toEqual(["b"]);
  });

  it("caps the list at the Home limit", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockResolvedValue(
      Array.from({ length: HOME_JOURNEY_LIMIT + 2 }, (_, i) =>
        order({ id: `order-${i}` }),
      ),
    );

    expect((await getHomeView())?.journeys).toHaveLength(HOME_JOURNEY_LIMIT);
  });

  it("returns an empty list rather than filler when there are no orders", async () => {
    signedIn();
    expect((await getHomeView())?.journeys).toEqual([]);
  });

  it("reports a missing pricing snapshot as null, not zero", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockResolvedValue([
      order({ pricing: null }),
    ]);
    expect((await getHomeView())?.journeys[0]?.totalGhs).toBeNull();
  });
});

// ── Live receipt ─────────────────────────────────────────────────────────────

describe("getHomeView — live receipt", () => {
  it("prices the last link the customer pasted under their EXISTING lock, as the signed-in viewer plus their quote cookie", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockResolvedValue(paste());
    vi.mocked(getExtractionById).mockResolvedValue({
      id: "cache-1",
      productUrl: "https://www.amazon.com/dp/B0TEST",
      result: extraction(),
    } as never);
    vi.mocked(priceUnderExistingLock).mockResolvedValue({
      pricing: { total_ghs: 5041.16, rate_lock_id: "lock-1", rate_locked_until: "2026-09-13T10:00:00Z" },
      reason: null,
    } as never);

    const receipt = (await getHomeView("6496e86b-b8fd-48fa-b19a-b543d501505a"))?.receipt;

    expect(receipt?.storeHost).toBe("amazon.com");
    expect(receipt?.pastedAt).toBe("2026-09-12T09:30:00.000Z");
    expect(receipt?.productName).toBe("Oraimo BoomPop N");
    expect(receipt?.productImageUrl).toBe("https://img.example/boompop.jpg");
    expect(receipt?.pricing?.total_ghs).toBe(5041.16);
    expect(receipt?.pricing?.rate_locked_until).toBe("2026-09-13T10:00:00Z");
    expect(receipt?.extractionCacheId).toBe("cache-1");
    expect(priceUnderExistingLock).toHaveBeenCalledWith({
      viewer: { userId: "user-1", sessionId: "6496e86b-b8fd-48fa-b19a-b543d501505a" },
      extraction: extraction(),
      extractionCacheId: "cache-1",
      quantity: 1,
      overrides: null,
    });
    // Looking at Home is not asking for a quote: the minting entry point is never used.
    expect(applyRateLock).not.toHaveBeenCalled();
  });

  it("passes a null session when the customer has no quote cookie", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockResolvedValue(paste());
    vi.mocked(getExtractionById).mockResolvedValue({ id: "cache-1", productUrl: "x", result: extraction() } as never);

    await getHomeView();

    expect(priceUnderExistingLock).toHaveBeenCalledWith(expect.objectContaining({ viewer: { userId: "user-1", sessionId: null } }));
  });

  it("is null when the customer has pasted nothing", async () => {
    signedIn();
    expect((await getHomeView())?.receipt).toBeNull();
    expect(getExtractionById).not.toHaveBeenCalled();
  });

  it("falls back to the url_hash when the cache row has been pruned", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockResolvedValue(
      paste({ extraction_cache_id: null }),
    );
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({
      id: "cache-2",
      result: extraction(),
    } as never);

    const receipt = (await getHomeView())?.receipt;

    expect(getExtractionById).not.toHaveBeenCalled();
    expect(getCachedExtractionByHash).toHaveBeenCalledWith("hash-1");
    expect(receipt?.extractionCacheId).toBe("cache-2");
  });

  it("falls back to the url_hash when the id lookup misses", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockResolvedValue(paste());
    vi.mocked(getExtractionById).mockResolvedValue(null);
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({
      id: "cache-3",
      result: extraction(),
    } as never);

    expect((await getHomeView())?.receipt?.extractionCacheId).toBe("cache-3");
  });

  it("renders nothing rather than crashing when the extraction is gone", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockResolvedValue(paste());

    const view = await getHomeView();

    expect(view?.receipt).toBeNull();
    expect(view?.greeting).toBeDefined();
  });

  it("keeps the receipt when pricing is unavailable, and says why", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockResolvedValue(paste());
    vi.mocked(getExtractionById).mockResolvedValue({
      id: "cache-1",
      productUrl: "https://www.amazon.com/dp/B0TEST",
      result: extraction(),
    } as never);
    vi.mocked(priceUnderExistingLock).mockResolvedValue({
      pricing: null,
      reason: "Price could not be read from the product page.",
    } as never);

    const receipt = (await getHomeView())?.receipt;
    expect(receipt?.pricing).toBeNull();
    expect(receipt?.pricingUnavailableReason).toBe(
      "Price could not be read from the product page.",
    );
  });

  it("survives a product_url that is not a parsable URL", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockResolvedValue(
      paste({ product_url: "not a url" }),
    );
    vi.mocked(getExtractionById).mockResolvedValue({
      id: "cache-1",
      productUrl: "not a url",
      result: extraction(),
    } as never);

    expect((await getHomeView())?.receipt?.storeHost).toBe("");
  });
});

// ── Lanes + ask a buyer ──────────────────────────────────────────────────────

describe("getHomeView — lane and contact cards", () => {
  it("derives the lane copy from the seeded regions", async () => {
    signedIn();

    const view = await getHomeView();

    expect(view?.lanes?.heading).toBe("Shipping from the USA");
    expect(view?.lanes?.body).toBe(
      "Any US store, 14–18 days to Accra. UK and China lanes are coming soon — get notified.",
    );
    expect(view?.lanes?.waitlist?.href).toBe("/where-we-buy#stores");
  });

  it("resolves the WhatsApp link and hours from site_settings", async () => {
    signedIn();

    expect((await getHomeView())?.askBuyer).toEqual({
      whatsappHref: "https://wa.me/233245550192",
      supportHours: "8am–10pm",
    });
  });

  it("degrades a flaky regions read to no lane card rather than stale copy", async () => {
    signedIn();
    vi.mocked(listRegions).mockRejectedValue(new Error("timeout"));

    const view = await getHomeView();

    expect(view?.lanes).toBeNull();
    expect(view?.greeting).toBeDefined();
  });

  it("rethrows a missing regions table so a bad deploy fails loudly", async () => {
    signedIn();
    vi.mocked(listRegions).mockRejectedValue(
      new Error(
        "Failed to load regions: Could not find the table 'public.regions' in the schema cache",
      ),
    );

    await expect(getHomeView()).rejects.toThrow("Could not find the table");
  });

  it("degrades a flaky site_settings read to no WhatsApp link", async () => {
    signedIn();
    vi.mocked(getSiteSettingsMap).mockRejectedValue(new Error("timeout"));

    expect((await getHomeView())?.askBuyer).toEqual({
      whatsappHref: null,
      supportHours: null,
    });
  });
});

// ── Failure policy ───────────────────────────────────────────────────────────

describe("getHomeView — failure policy", () => {
  it("rethrows a missing table so a bad deploy fails loudly", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockRejectedValue(
      new Error(
        "Failed to load recent orders: Could not find the table 'public.orders' in the schema cache",
      ),
    );

    await expect(getHomeView()).rejects.toThrow("Could not find the table");
  });

  it("rethrows a missing extraction_requests table", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockRejectedValue({
      code: "42P01",
      message: 'relation "extraction_requests" does not exist',
    });

    await expect(getHomeView()).rejects.toBeDefined();
  });

  it("degrades one flaky read without taking the screen down", async () => {
    signedIn();
    vi.mocked(countMovingOrders).mockRejectedValue(new Error("timeout"));
    vi.mocked(getRecentOrdersForUser).mockResolvedValue([order()]);

    const view = await getHomeView();

    expect(view?.greeting.movingCount).toBe(0);
    expect(view?.journeys).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("degrades a failed paste lookup to no receipt", async () => {
    signedIn();
    vi.mocked(getLatestExtractionRequest).mockRejectedValue(
      new Error("connection reset"),
    );

    expect((await getHomeView())?.receipt).toBeNull();
  });
});

describe("isSchemaMissingError", () => {
  it("flags PostgREST's schema-cache miss, with or without the code", () => {
    expect(
      isSchemaMissingError({
        code: "PGRST205",
        message: "Could not find the table 'public.orders' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isSchemaMissingError(
        new Error(
          "Failed to load recent orders: Could not find the table 'public.orders' in the schema cache",
        ),
      ),
    ).toBe(true);
  });

  it("flags SQLSTATE 42P01", () => {
    expect(
      isSchemaMissingError(
        new Error('relation "extraction_requests" does not exist'),
      ),
    ).toBe(true);
  });

  it("does not flag ordinary failures", () => {
    expect(isSchemaMissingError(new Error("timeout"))).toBe(false);
    expect(isSchemaMissingError(null)).toBe(false);
    expect(isSchemaMissingError(undefined)).toBe(false);
    expect(isSchemaMissingError({ code: "PGRST301" })).toBe(false);
  });
});

describe("getHomeView — rate lock chip", () => {
  it("carries rate_lock_hours from pricing_constants so the chip and the lock agree", async () => {
    signedIn();
    expect((await getHomeView())?.rateLockHours).toBe(24);
  });

  it("drops the chip (null) rather than showing a hardcoded number when the read is flaky", async () => {
    signedIn();
    vi.mocked(loadQuoteConstants).mockRejectedValueOnce(new Error("timeout"));
    expect((await getHomeView())?.rateLockHours).toBeNull();
  });

  it("goes red when the seeded constant is MISSING — a deploy before migrate must not render a quiet Home", async () => {
    signedIn();
    vi.mocked(loadQuoteConstants).mockRejectedValueOnce(new QuoteConstantsMissingError(["rate_lock_hours"]));
    await expect(getHomeView()).rejects.toBeInstanceOf(QuoteConstantsMissingError);
  });
});
