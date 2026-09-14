import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/extraction/extraction.service", () => ({ getExtractionSnapshot: vi.fn() }));
vi.mock("@/features/extraction/scrapers", () => ({ resolvePlatform: vi.fn(() => ({ name: "amazon" })) }));
vi.mock("@/features/extraction/resolvers/merge", () => ({ hasRequiredFields: vi.fn(() => true) }));
// The gap-fill rule stays real: it is the thing under test. Only the pricer is stubbed.
vi.mock("@/features/extraction/quote.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/extraction/quote.service")>()),
  priceExtractionWith: vi.fn(),
}));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn(async () => CALC) }));
vi.mock("@/lib/exchange-rates/service", () => ({ listGhsRates: vi.fn(async () => ({ USD: 14.43 })) }));
vi.mock("@/db/queries/quote-locks", () => ({
  findActiveLock: vi.fn(),
  getQuoteLockById: vi.fn(),
  insertQuoteLock: vi.fn(),
  ratchetLockRate: vi.fn(async () => true),
  adoptSessionLocks: vi.fn(async () => []),
  consumeLock: vi.fn(),
  consumeActiveLocks: vi.fn(),
}));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/quotes/services/quote-constants.service", () => {
  class QuoteConstantsMissingError extends Error {}
  return { QuoteConstantsMissingError, loadQuoteConstants: vi.fn() };
});
vi.mock("@/features/quotes/services/delivery-eta.service", () => ({ loadDeliveryWindow: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/errors", () => ({
  isSchemaMissingError: (e: unknown) => /could not find the table|does not exist/i.test(e instanceof Error ? e.message : String(e)),
}));

const CALC = { __brand: "calculator" };

import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { priceExtractionWith } from "@/features/extraction/quote.service";
import { findActiveLock, insertQuoteLock, ratchetLockRate, type QuoteLockRow } from "@/db/queries/quote-locks";
import { QuoteConstantsMissingError } from "@/features/quotes/services/quote-constants.service";
import { logger } from "@/lib/logger";
import type { ExtractionResult } from "@/features/extraction/types";
import type { PricingBreakdown } from "@/lib/pricing";
import { buildOrderIntake } from "../services/order-intake.service";

const CACHE_ID = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";
const URL = "https://www.amazon.com/dp/B0D1XD1ZV3";
const viewer = { userId: "user-1", sessionId: null };

function breakdown(overrides: Partial<PricingBreakdown> = {}): PricingBreakdown {
  return {
    pricing_method: "flat_rate", pricing_group: "phones", item_price: 263.86, item_currency: "USD",
    item_price_usd: 263.86, quantity: 1, subtotal_usd: 263.86, exchange_rate: 15.01, mid_market_rate: 14.43,
    tax_percentage: 0.1, tax_usd: 26.39, value_fee_percentage: 0.04, value_fee_usd: 10.55, flat_rate_ghs: 250,
    total_ghs: 4765.01, total_pesewas: 476501, fee_calculation_note: "flat rate: Phones", ...overrides,
  };
}

function snapshot(price: number | null = 263.86): { id: string; productUrl: string; result: ExtractionResult } {
  return {
    id: CACHE_ID,
    productUrl: URL,
    result: {
      extraction_attempted: true, extraction_success: true, platform: "amazon", country: "USA",
      product: { title: "Apple AirPods Pro 2", price, currency: "USD", category: "cell_phones" },
      messages: [], errors: [], source: null, sources: [], confidence: {}, fetched_at: "2026-09-12T09:00:00Z",
    } as unknown as ExtractionResult,
  };
}

function lock(overrides: Partial<QuoteLockRow> = {}): QuoteLockRow {
  return {
    id: "lock-1", user_id: "user-1", session_id: null, extraction_cache_id: CACHE_ID, quantity: 1,
    exchange_rate: 14.49, mid_market_rate: 13.93, fx_rates: { USD: 13.93, GBP: 18.5 }, pricing: breakdown(),
    locked_at: "2026-09-12T10:00:00Z", expires_at: "2026-09-13T10:00:00Z", consumed_by_order_id: null, consumed_at: null,
    created_at: "2026-09-12T10:00:00Z", ...overrides,
  };
}

/** Second pricing pass (under the lock) returns `locked`; the live pass returns the default. */
function priceLockedAs(locked: PricingBreakdown) {
  vi.mocked(priceExtractionWith).mockImplementation(async (_c, _e, _q, _o, fx) => ({ pricing: fx ? locked : breakdown(), reason: null }));
}

const input = { product_url: URL, product_name: "Apple AirPods Pro 2", quantity: 1, extraction_cache_id: CACHE_ID };
const CUSTOMER_PRICE_FLAG = "Price entered by customer, not verified against the store.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExtractionSnapshot).mockResolvedValue(snapshot());
  vi.mocked(findActiveLock).mockResolvedValue(null);
  vi.mocked(priceExtractionWith).mockResolvedValue({ pricing: breakdown(), reason: null });
});

describe("buildOrderIntake — rate lock", () => {
  it("prices under the unexpired lock's FX (pair + cross rates) when its total is lower, on one calculator", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock());
    priceLockedAs(breakdown({ exchange_rate: 14.49, mid_market_rate: 13.93, total_ghs: 4608.59 }));

    const intake = await buildOrderIntake(input, viewer);

    expect(findActiveLock).toHaveBeenCalledWith(viewer, CACHE_ID, expect.any(String));
    expect(priceExtractionWith).toHaveBeenNthCalledWith(1, CALC, expect.anything(), 1, null, null);
    expect(priceExtractionWith).toHaveBeenNthCalledWith(2, CALC, expect.anything(), 1, null, {
      exchange_rate: 14.49, mid_market_rate: 13.93, cross_rates: { USD: 13.93, GBP: 18.5 },
    });
    expect(intake.pricing).toMatchObject({ exchange_rate: 14.49, total_ghs: 4608.59, rate_lock_id: "lock-1", rate_locked_until: "2026-09-13T10:00:00Z" });
    expect(intake.rate_lock_id).toBe("lock-1");
    expect(intake.needs_review).toBe(false);
    expect(insertQuoteLock).not.toHaveBeenCalled();
  });

  it("prices live when the lock has expired or never existed, and never mints one", async () => {
    const intake = await buildOrderIntake(input, viewer);

    expect(priceExtractionWith).toHaveBeenCalledTimes(1);
    expect(priceExtractionWith).toHaveBeenCalledWith(CALC, expect.anything(), 1, null, null);
    expect(intake.pricing.exchange_rate).toBe(15.01);
    expect(intake.pricing.rate_lock_id).toBeUndefined();
    expect(intake.rate_lock_id).toBeNull();
    expect(insertQuoteLock).not.toHaveBeenCalled();
  });

  it("ratchets a lock whose total is now worse than live (rates + fx_rates) and charges the live total", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ exchange_rate: 15.6, mid_market_rate: 15 }));
    priceLockedAs(breakdown({ exchange_rate: 15.6, mid_market_rate: 15, total_ghs: 4950 }));

    const intake = await buildOrderIntake(input, viewer);

    expect(ratchetLockRate).toHaveBeenCalledWith("lock-1", { exchange_rate: 15.01, mid_market_rate: 14.43, fx_rates: { USD: 14.43 } });
    expect(intake.pricing).toMatchObject({ exchange_rate: 15.01, total_ghs: 4765.01, rate_lock_id: "lock-1" });
    expect(intake.rate_lock_id).toBe("lock-1");
  });

  it("does not look for a lock when the order has no extraction", async () => {
    await buildOrderIntake({ ...input, extraction_cache_id: undefined, estimated_price_usd: 200, origin_country: "USA" }, viewer);
    expect(findActiveLock).not.toHaveBeenCalled();
  });
});

describe("buildOrderIntake — the lock is never a price source", () => {
  it("ignores the client's estimate when the snapshot has a price (the gap-filler cannot bypass review)", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock());
    priceLockedAs(breakdown({ exchange_rate: 14.49, total_ghs: 4608.59 }));

    const intake = await buildOrderIntake({ ...input, estimated_price_usd: 1 }, viewer);

    // Priced from the snapshot: no override reaches the pricer, no review flag.
    expect(priceExtractionWith).toHaveBeenNthCalledWith(1, CALC, expect.anything(), 1, null, null);
    expect(intake.review_reasons).not.toContain(CUSTOMER_PRICE_FLAG);
    expect(intake.estimated_price_usd).toBe(263.86);
  });

  it("never reads the lock's stored pricing snapshot: a priceless snapshot + a lock still means a FLAGGED customer price", async () => {
    vi.mocked(getExtractionSnapshot).mockResolvedValue(snapshot(null));
    vi.mocked(findActiveLock).mockResolvedValue(lock({ pricing: breakdown({ item_price_usd: 263.86 }) }));
    vi.mocked(priceExtractionWith).mockImplementation(async (_c, _e, _q, overrides, fx) => ({
      pricing: breakdown({ item_price_usd: overrides?.itemPriceUsd ?? 0, exchange_rate: fx ? 14.49 : 15.01, total_ghs: fx ? 20 : 21 }),
      reason: null,
    }));

    const intake = await buildOrderIntake({ ...input, estimated_price_usd: 1 }, viewer);

    // Both passes are priced with the customer's number, never 263.86 from the lock row.
    expect(priceExtractionWith).toHaveBeenNthCalledWith(1, CALC, expect.anything(), 1, { itemPriceUsd: 1 }, null);
    expect(priceExtractionWith).toHaveBeenNthCalledWith(2, CALC, expect.anything(), 1, { itemPriceUsd: 1 }, expect.anything());
    expect(intake.estimated_price_usd).toBe(1);
    expect(intake.review_reasons).toContain(CUSTOMER_PRICE_FLAG);
    expect(intake.needs_review).toBe(true);
    expect(intake.rate_lock_id).toBe("lock-1");
  });

  it("with the cache row gone there is no lock lookup at all; the customer's estimate is flagged", async () => {
    vi.mocked(getExtractionSnapshot).mockResolvedValue(null);

    const intake = await buildOrderIntake({ ...input, estimated_price_usd: 1 }, viewer);

    expect(findActiveLock).not.toHaveBeenCalled();
    expect(priceExtractionWith).toHaveBeenCalledWith(CALC, expect.anything(), 1, { itemPriceUsd: 1 }, null);
    expect(intake.review_reasons).toContain(CUSTOMER_PRICE_FLAG);
    expect(intake.review_reasons).toContain("Order placed without automatic product extraction.");
    expect(intake.extraction_cache_id).toBeNull();
    expect(intake.rate_lock_id).toBeNull();
  });

  it("still falls back to the customer's estimate (flagged) when the snapshot has no price", async () => {
    vi.mocked(getExtractionSnapshot).mockResolvedValue(snapshot(null));

    const intake = await buildOrderIntake({ ...input, estimated_price_usd: 200 }, viewer);

    expect(priceExtractionWith).toHaveBeenCalledWith(CALC, expect.anything(), 1, { itemPriceUsd: 200 }, null);
    expect(intake.review_reasons).toContain(CUSTOMER_PRICE_FLAG);
  });
});

describe("buildOrderIntake — lock failure policy", () => {
  it("degrades a transient lock failure to live pricing with no lock and an error logged", async () => {
    vi.mocked(findActiveLock).mockRejectedValue(new Error("Failed to load quote lock: timeout"));

    const intake = await buildOrderIntake(input, viewer);

    expect(intake.pricing).toMatchObject({ exchange_rate: 15.01 });
    expect(intake.pricing.rate_lock_id).toBeUndefined();
    expect(intake.rate_lock_id).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it("degrades when pricing under the lock fails, keeping the live price", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock());
    vi.mocked(priceExtractionWith).mockImplementation(async (_c, _e, _q, _o, fx) =>
      fx ? { pricing: null, reason: "Locked exchange rate for GBP/GHS is missing from the rate lock." } : { pricing: breakdown(), reason: null },
    );

    const intake = await buildOrderIntake(input, viewer);

    expect(intake.pricing.exchange_rate).toBe(15.01);
    expect(intake.rate_lock_id).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it("rethrows a missing quote_locks table", async () => {
    vi.mocked(findActiveLock).mockRejectedValue(new Error("Failed to load quote lock: Could not find the table 'public.quote_locks' in the schema cache"));
    await expect(buildOrderIntake(input, viewer)).rejects.toThrow(/quote_locks/);
  });

  it("rethrows a missing seeded quote constant", async () => {
    vi.mocked(findActiveLock).mockRejectedValue(new QuoteConstantsMissingError(["rate_lock_hours"]));
    await expect(buildOrderIntake(input, viewer)).rejects.toBeInstanceOf(QuoteConstantsMissingError);
  });

  it("still fails the order when LIVE pricing is unavailable — that is not a lock problem", async () => {
    vi.mocked(priceExtractionWith).mockResolvedValue({ pricing: null, reason: "Exchange rate for USD/GHS not available." });
    await expect(buildOrderIntake(input, viewer)).rejects.toMatchObject({ statusCode: 503 });
  });
});
