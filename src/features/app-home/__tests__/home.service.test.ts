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
vi.mock("@/db/queries/receipt-state", () => ({
  getReceiptFulfilment: vi.fn(async () => ({ kind: "none" })),
  NO_FULFILMENT: { kind: "none" },
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
// The deals shelf's two catalogue reads. Both reach `catalog_products` through
// the admin client at module scope, which is exactly what this file must not do.
vi.mock("@/features/catalog/services/catalog-search.service", () => ({
  listCatalogDeals: vi.fn(),
  listBrowsableCategories: vi.fn(),
}));
// The freight-box card reads the open bag; the bag service reaches Supabase at
// module scope, so it is stubbed like every other data dependency here.
vi.mock("@/features/orders/services/order-events.service", () => ({
  mapCustomerOrderEvents: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ __brand: "admin" })) }));
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
import {
  listBrowsableCategories,
  listCatalogDeals,
} from "@/features/catalog/services/catalog-search.service";
import type { CatalogProduct } from "@/features/catalog/types";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { applyRateLock, priceUnderExistingLock } from "@/features/quotes/services/quote-lock.service";
import { loadQuoteConstants, QuoteConstantsMissingError } from "@/features/quotes/services/quote-constants.service";
import { logger } from "@/lib/logger";
import { mapCustomerOrderEvents } from "@/features/orders/services/order-events.service";
import type { OrderEventRow } from "@/db/queries/order-events";

import { isSchemaMissingError } from "@/lib/supabase/errors";
import {
  HOME_DEALS_LIMIT,
  HOME_ORDER_LIMIT,
  HOME_ORDER_STATUSES,
  buildHomeOrders,
  getHomeView,
  timeOfDayFor,
} from "../services/home.service";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function order(overrides: Record<string, unknown> = {}): RecentOrderRow {
  return {
    id: "order-1",
    order_no: "TM-00042",
    product_name: "Oraimo BoomPop N",
    product_url: "https://www.amazon.com/dp/B0TEST",
    product_image_url: "https://img.example/boompop.jpg",
    store_platform: null,
    status: "in_transit",
    pricing: { total_ghs: 5041.16 },
    admin_total_ghs: null,
    estimated_delivery_date: "2026-09-19",
    eta_from: null,
    eta_to: null,
    delivered_at: null,
    created_at: "2026-09-10T10:00:00.000Z",
    ...overrides,
  } as unknown as RecentOrderRow;
}

function event(overrides: Partial<OrderEventRow> = {}): OrderEventRow {
  return {
    id: "event-1",
    order_id: "order-1",
    kind: "departed",
    title: "On its way to Accra",
    detail: null,
    location: "New York",
    weight_lbs: null,
    occurred_at: "2026-09-06T10:00:00.000Z",
    ...overrides,
  } as OrderEventRow;
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
function catalogProduct(id: string, totalGhs: number): CatalogProduct {
  return {
    id,
    store: "amazon",
    external_id: null,
    title: `Product ${id}`,
    image_url: null,
    product_url: `https://amazon.com/dp/${id}`,
    price_usd: 20,
    currency: "USD",
    rating: 4.5,
    review_count: 100,
    category: "Electronics",
    last_seen_at: "2026-09-14T00:00:00.000Z",
    total_ghs: totalGhs,
    pricing_group: "electronics",
    pricing_method: "weight",
    exchange_rate: 12,
    unpriceable: false,
    cheapest_in_store: true,
  };
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
  vi.mocked(listCatalogDeals).mockResolvedValue({
    query: "",
    count: 1,
    total: 24,
    results: [catalogProduct("a", 400)],
  });
  vi.mocked(listBrowsableCategories).mockResolvedValue([
    { category: "Electronics", count: 40 },
    { category: "Home", count: 9 },
  ]);
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

// ── Your orders ──────────────────────────────────────────────────────────────

describe("getHomeView — your orders", () => {
  it("asks the database only for placed orders, capped at the Home limit", async () => {
    signedIn();
    await getHomeView();
    expect(getRecentOrdersForUser).toHaveBeenCalledWith(
      fakeClient,
      "user-1",
      HOME_ORDER_LIMIT,
      HOME_ORDER_STATUSES,
    );
    expect(HOME_ORDER_STATUSES).not.toContain("pending");
    expect(HOME_ORDER_STATUSES).not.toContain("cancelled");
    expect(HOME_ORDER_STATUSES).toContain("delivered");
  });

  it("returns no orders — and reads no events — when the customer has placed none", async () => {
    signedIn();
    expect((await getHomeView())?.orders).toEqual([]);
    expect(mapCustomerOrderEvents).not.toHaveBeenCalled();
  });

  it("builds each card from the order row and its own events", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockResolvedValue([order()]);
    vi.mocked(mapCustomerOrderEvents).mockResolvedValue(new Map([["order-1", [event()]]]));

    const card = (await getHomeView())?.orders[0];

    expect(mapCustomerOrderEvents).toHaveBeenCalledWith({ __brand: "admin" }, ["order-1"]);
    expect(card).toMatchObject({
      id: "order-1",
      href: "/app/orders/order-1",
      orderNo: "TM-00042",
      productName: "Oraimo BoomPop N",
      productImageUrl: "https://img.example/boompop.jpg",
      store: "Amazon",
      stageLabel: "In the air",
      totalGhs: 5041.16,
      latest: { kind: "event", title: "On its way to Accra", note: "New York", at: "2026-09-06T10:00:00.000Z" },
    });
    const air = card?.track.stops.find((stop) => stop.key === "in_the_air");
    expect(air?.state).toBe("now");
    expect(air?.at).toBe("2026-09-06T10:00:00.000Z");
  });

  it("keeps the orders when the events read fails — the track falls back to the status", async () => {
    signedIn();
    vi.mocked(getRecentOrdersForUser).mockResolvedValue([order()]);
    vi.mocked(mapCustomerOrderEvents).mockRejectedValue(new Error("timeout"));

    const cards = (await getHomeView())?.orders ?? [];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.track.stops.find((stop) => stop.state === "now")?.key).toBe("in_the_air");
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("buildHomeOrders", () => {
  it("drops unpaid and cancelled orders even if the query returned them", () => {
    const cards = buildHomeOrders(
      [
        order({ id: "a", status: "pending" }),
        order({ id: "b", status: "cancelled" }),
        order({ id: "c", status: "paid" }),
        order({ id: "d", status: "delivered" }),
      ],
      new Map(),
    );
    expect(cards.map((card) => card.id)).toEqual(["c", "d"]);
  });

  it("caps the cards at the Home limit, keeping the newest", () => {
    const rows = Array.from({ length: HOME_ORDER_LIMIT + 2 }, (_, i) => order({ id: `o-${i}` }));
    expect(buildHomeOrders(rows, new Map()).map((card) => card.id)).toEqual(
      rows.slice(0, HOME_ORDER_LIMIT).map((row) => row.id),
    );
  });

  it("uses the newest event for the latest line", () => {
    const [card] = buildHomeOrders(
      [order()],
      new Map([
        [
          "order-1",
          [
            event({ id: "e1", kind: "purchased", title: "Our buyer is placing the order", location: null, occurred_at: "2026-09-02T08:00:00.000Z" }),
            event({ id: "e2", occurred_at: "2026-09-06T10:00:00.000Z" }),
          ],
        ],
      ]),
    );
    expect(card?.latest).toMatchObject({ kind: "event", title: "On its way to Accra" });
  });

  it("falls back to the delivery window, then to the stage hint — never an invented date", () => {
    const [withEta] = buildHomeOrders([order({ status: "processing", eta_from: "2026-09-18", eta_to: "2026-09-20" })], new Map());
    expect(withEta?.latest).toEqual({
      kind: "eta",
      eta: { from: "2026-09-18", to: "2026-09-20", source: "confirmed" },
    });

    const [bare] = buildHomeOrders(
      [order({ status: "processing", estimated_delivery_date: null, pricing: { total_ghs: 10 } })],
      new Map(),
    );
    expect(bare?.eta).toBeNull();
    expect(bare?.latest).toEqual({ kind: "hint", text: "Date set when it ships" });
  });

  it("does not print a delivery window as the latest news once delivered", () => {
    const [card] = buildHomeOrders(
      [order({ status: "delivered", delivered_at: "2026-09-19T12:00:00.000Z" })],
      new Map(),
    );
    expect(card?.latest).toEqual({ kind: "hint", text: "Delivered" });
    expect(card?.track.isComplete).toBe(true);
    expect(card?.track.stops.at(-1)?.at).toBe("2026-09-19T12:00:00.000Z");
  });

  it("prefers the admin's total, and reports a missing price as null, not zero", () => {
    expect(buildHomeOrders([order({ admin_total_ghs: 4800 })], new Map())[0]?.totalGhs).toBe(4800);
    expect(buildHomeOrders([order({ pricing: null })], new Map())[0]?.totalGhs).toBeNull();
  });

  it("falls back to the extraction's platform for an unknown store, and to null", () => {
    const unknown = { product_url: "https://shop.example/p/1" };
    expect(buildHomeOrders([order({ ...unknown, store_platform: "Etsy" })], new Map())[0]?.store).toBe("Etsy");
    expect(buildHomeOrders([order({ ...unknown, store_platform: null })], new Map())[0]?.store).toBeNull();
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

// ── Deals + ask a buyer ──────────────────────────────────────────────────────

describe("getHomeView — deals shelf and contact card", () => {
  it("builds the shelf from the catalogue, with its pills and its true totals", async () => {
    signedIn();

    const view = await getHomeView();

    expect(view?.deals?.products).toHaveLength(1);
    expect(view?.deals?.products[0]?.total_ghs).toBe(400);
    expect(view?.deals?.categories.map((c) => c.label)).toEqual(["Electronics", "Home"]);
    expect(view?.catalogueCount).toBe(49);
  });

  it("asks for the shelf's own limit, not a whole browse page", async () => {
    signedIn();
    await getHomeView();
    expect(listCatalogDeals).toHaveBeenCalledWith({ limit: HOME_DEALS_LIMIT });
  });

  it("shows no shelf when nothing in the catalogue could be priced", async () => {
    signedIn();
    vi.mocked(listCatalogDeals).mockResolvedValue({
      query: "",
      count: 0,
      total: 0,
      results: [],
    });

    expect((await getHomeView())?.deals).toBeNull();
  });

  it("degrades a flaky catalogue read to no shelf rather than taking the screen down", async () => {
    signedIn();
    vi.mocked(listCatalogDeals).mockRejectedValue(new Error("timeout"));
    vi.mocked(listBrowsableCategories).mockRejectedValue(new Error("timeout"));

    const view = await getHomeView();

    expect(view?.deals).toBeNull();
    expect(view?.catalogueCount).toBe(0);
    expect(view?.greeting).toBeDefined();
  });

  it("rethrows a missing catalogue table so a bad deploy fails loudly", async () => {
    signedIn();
    vi.mocked(listCatalogDeals).mockRejectedValue(
      new Error(
        "Failed to load catalog deals: Could not find the table 'public.catalog_products' in the schema cache",
      ),
    );

    await expect(getHomeView()).rejects.toThrow("Could not find the table");
  });

  it("resolves the WhatsApp link and hours from site_settings", async () => {
    signedIn();

    expect((await getHomeView())?.askBuyer).toEqual({
      whatsappHref: "https://wa.me/233245550192",
      supportHours: "8am–10pm",
    });
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
    expect(view?.orders).toHaveLength(1);
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
