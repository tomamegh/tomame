import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/quote-locks", () => ({
  findActiveLock: vi.fn(),
  getQuoteLockById: vi.fn(),
  insertQuoteLock: vi.fn(),
  ratchetLockRate: vi.fn(async () => true),
  adoptSessionLocks: vi.fn(async () => []),
  consumeLock: vi.fn(async () => 1),
  consumeActiveLocks: vi.fn(async () => []),
}));
vi.mock("@/features/extraction/quote.service", () => ({ priceExtractionWith: vi.fn() }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn(async () => CALC) }));
vi.mock("@/lib/exchange-rates/service", () => ({ listGhsRates: vi.fn(async () => LIVE_RATES) }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("../services/quote-constants.service", () => {
  class QuoteConstantsMissingError extends Error {}
  return {
    QuoteConstantsMissingError,
    loadQuoteConstants: vi.fn(async () => ({ rate_lock_hours: 24, purchase_lead_days_min: 1, purchase_lead_days_max: 3 })),
  };
});
vi.mock("../services/delivery-eta.service", () => ({
  loadDeliveryWindow: vi.fn(async () => ({ from: "2026-09-27", to: "2026-10-03" })),
}));
// The real helper matches on message text (db/queries flatten PostgREST errors).
vi.mock("@/lib/supabase/errors", () => ({
  isSchemaMissingError: (e: unknown) =>
    /could not find the table|does not exist|PGRST205|42P01/i.test(e instanceof Error ? e.message : String(e)),
}));

const CALC = { __brand: "calculator" };
const LIVE_RATES = { USD: 14.43, GBP: 19.4, CNY: 2.02 };

import {
  adoptSessionLocks,
  consumeActiveLocks,
  consumeLock,
  findActiveLock,
  insertQuoteLock,
  ratchetLockRate,
  type QuoteLockRow,
} from "@/db/queries/quote-locks";
import { priceExtractionWith } from "@/features/extraction/quote.service";
import { listGhsRates } from "@/lib/exchange-rates/service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { logger } from "@/lib/logger";
import type { ExtractionResult } from "@/features/extraction/types";
import type { PricingBreakdown } from "@/lib/pricing";
import type { Viewer } from "../types";
import { loadQuoteConstants, QuoteConstantsMissingError } from "../services/quote-constants.service";
import {
  applyRateLock,
  consumeQuoteLocksForOrder,
  priceLowerOf,
  priceUnderExistingLock,
  resolveLockForOrder,
} from "../services/quote-lock.service";

const CACHE_ID = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";

function breakdown(overrides: Partial<PricingBreakdown> = {}): PricingBreakdown {
  return {
    pricing_method: "flat_rate", pricing_group: "phones", item_price: 263.86, item_currency: "USD",
    item_price_usd: 263.86, quantity: 1, subtotal_usd: 263.86, exchange_rate: 15.01, mid_market_rate: 14.43,
    tax_percentage: 0.1, tax_usd: 26.39, value_fee_percentage: 0.04, value_fee_usd: 10.55, flat_rate_ghs: 250,
    total_ghs: 4765.01, total_pesewas: 476501, fee_calculation_note: "flat rate: Phones", ...overrides,
  };
}

function lock(overrides: Partial<QuoteLockRow> = {}): QuoteLockRow {
  return {
    id: "lock-1", user_id: null, session_id: "sess-1", extraction_cache_id: CACHE_ID, quantity: 1,
    exchange_rate: 15.01, mid_market_rate: 14.43, fx_rates: { USD: 14.43, GBP: 19.4, CNY: 2.02 }, pricing: breakdown(),
    locked_at: "2026-09-12T10:00:00Z", expires_at: "2026-09-13T10:00:00Z", consumed_by_order_id: null, consumed_at: null,
    created_at: "2026-09-12T10:00:00Z", ...overrides,
  };
}

const extraction = { country: "USA", product: { price: 263.86, currency: "USD" } } as unknown as ExtractionResult;
const anon: Viewer = { userId: null, sessionId: "sess-1" };

function run(viewer: Viewer = anon, quantity = 1) {
  return applyRateLock({ viewer, extraction, extractionCacheId: CACHE_ID, quantity, overrides: null });
}

/** Second pricing pass (under the lock) returns `locked`; the first (live) returns the default. */
function priceLockedAs(locked: PricingBreakdown) {
  vi.mocked(priceExtractionWith).mockImplementation(async (_c, _e, _q, _o, fx) => ({ pricing: fx ? locked : breakdown(), reason: null }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(priceExtractionWith).mockResolvedValue({ pricing: breakdown(), reason: null });
  vi.mocked(findActiveLock).mockResolvedValue(null);
  vi.mocked(adoptSessionLocks).mockResolvedValue([]);
  vi.mocked(ratchetLockRate).mockResolvedValue(true);
  vi.mocked(listGhsRates).mockResolvedValue(LIVE_RATES);
  vi.mocked(insertQuoteLock).mockImplementation(async (input) => lock({ ...input, id: "minted-1" }));
});

describe("applyRateLock — minting", () => {
  it("mints a lock at today's FX with every X→GHS rate frozen, for rate_lock_hours", async () => {
    const { pricing } = await run();

    expect(insertQuoteLock).toHaveBeenCalledTimes(1);
    const inserted = vi.mocked(insertQuoteLock).mock.calls[0]![0];
    expect(inserted).toMatchObject({
      session_id: "sess-1", user_id: null, extraction_cache_id: CACHE_ID,
      exchange_rate: 15.01, mid_market_rate: 14.43, fx_rates: LIVE_RATES,
    });
    expect(new Date(inserted.expires_at).getTime() - new Date(inserted.locked_at).getTime()).toBe(24 * 3600 * 1000);
    expect(pricing).toMatchObject({ rate_lock_id: "minted-1", rate_locked_until: inserted.expires_at, exchange_rate: 15.01 });
    expect(pricing).toMatchObject({ delivery_eta_from: "2026-09-27", delivery_eta_to: "2026-10-03" });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "quote_lock_minted", actorRole: "system", entityType: "quote_lock", entityId: "minted-1" }));
  });

  it("loads the calculator once and prices live on it", async () => {
    await run();
    expect(priceExtractionWith).toHaveBeenCalledWith(CALC, extraction, 1, null, null);
  });

  it("asks the query for an unexpired lock as of now, so an expired one is never reused", async () => {
    const before = Date.now();
    await run();
    const [viewer, id, nowIso] = vi.mocked(findActiveLock).mock.calls[0]!;
    expect(viewer).toEqual(anon);
    expect(id).toBe(CACHE_ID);
    expect(new Date(nowIso).getTime()).toBeGreaterThanOrEqual(before);
    expect(insertQuoteLock).toHaveBeenCalledTimes(1);
  });

  it("does not mint for a viewer with no identity and prices live with a warning", async () => {
    const { pricing } = await run({ userId: null, sessionId: null });
    expect(findActiveLock).not.toHaveBeenCalled();
    expect(insertQuoteLock).not.toHaveBeenCalled();
    expect(pricing?.rate_lock_id).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("prices live with the ETA and touches no lock when the extraction has no cache row", async () => {
    const { pricing } = await applyRateLock({ viewer: anon, extraction, extractionCacheId: null, quantity: 1, overrides: null });
    expect(findActiveLock).not.toHaveBeenCalled();
    expect(insertQuoteLock).not.toHaveBeenCalled();
    expect(pricing).toMatchObject({ exchange_rate: 15.01, delivery_eta_from: "2026-09-27" });
    expect(pricing?.rate_lock_id).toBeUndefined();
  });

  it("returns the pricing failure untouched and mints nothing", async () => {
    vi.mocked(priceExtractionWith).mockResolvedValue({ pricing: null, reason: "Price could not be read from the product page." });
    expect(await run()).toEqual({ pricing: null, reason: "Price could not be read from the product page." });
    expect(insertQuoteLock).not.toHaveBeenCalled();
  });
});

describe("applyRateLock — lower of locked and live, by total", () => {
  it("re-prices under the lock's FX (pair + cross rates) and keeps it when its total is lower", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ exchange_rate: 14.49, mid_market_rate: 13.93, fx_rates: { USD: 13.93, GBP: 18.5 } }));
    priceLockedAs(breakdown({ exchange_rate: 14.49, mid_market_rate: 13.93, total_ghs: 4608.59 }));

    const { pricing } = await run(anon, 2);

    expect(priceExtractionWith).toHaveBeenNthCalledWith(2, CALC, extraction, 2, null, {
      exchange_rate: 14.49, mid_market_rate: 13.93, cross_rates: { USD: 13.93, GBP: 18.5 },
    });
    expect(pricing).toMatchObject({ exchange_rate: 14.49, total_ghs: 4608.59, rate_lock_id: "lock-1", rate_locked_until: "2026-09-13T10:00:00Z" });
    expect(insertQuoteLock).not.toHaveBeenCalled();
    expect(ratchetLockRate).not.toHaveBeenCalled();
  });

  it("judges by TOTAL: a lock whose USD rate is higher still wins when its cross rate makes the line cheaper", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ exchange_rate: 15.6, mid_market_rate: 15, fx_rates: { USD: 15, GBP: 17 } }));
    vi.mocked(priceExtractionWith).mockImplementation(async (_c, _e, _q, _o, fx) => ({
      pricing: breakdown({ item_currency: "GBP", exchange_rate: fx ? 15.6 : 15.01, total_ghs: fx ? 4400 : 4765.01 }),
      reason: null,
    }));

    const { pricing } = await run();

    expect(pricing).toMatchObject({ exchange_rate: 15.6, total_ghs: 4400, rate_lock_id: "lock-1" });
    expect(ratchetLockRate).not.toHaveBeenCalled();
  });

  it("reuses the lock without a second pricing pass when a USD line's rates are identical", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock());
    const { pricing } = await run();
    expect(priceExtractionWith).toHaveBeenCalledTimes(1);
    expect(pricing?.rate_lock_id).toBe("lock-1");
  });

  it("always re-prices a non-USD line under the lock — identical USD rates do not mean identical totals", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock());
    vi.mocked(priceExtractionWith).mockResolvedValue({ pricing: breakdown({ item_currency: "GBP" }), reason: null });
    await run();
    expect(priceExtractionWith).toHaveBeenCalledTimes(2);
  });

  it("ratchets the lock down to live (rates + fx_rates), keeps expiry, audits, and charges live", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ exchange_rate: 15.6, mid_market_rate: 15, fx_rates: { USD: 15, GBP: 20 } }));
    priceLockedAs(breakdown({ exchange_rate: 15.6, mid_market_rate: 15, total_ghs: 4950 }));

    const { pricing } = await run();

    expect(listGhsRates).toHaveBeenCalledTimes(1);
    expect(ratchetLockRate).toHaveBeenCalledWith("lock-1", { exchange_rate: 15.01, mid_market_rate: 14.43, fx_rates: LIVE_RATES });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "quote_lock_ratcheted", entityId: "lock-1",
      metadata: expect.objectContaining({ from_exchange_rate: 15.6, to_exchange_rate: 15.01, fx_currencies: ["USD", "GBP", "CNY"] }),
    }));
    expect(pricing).toMatchObject({ exchange_rate: 15.01, total_ghs: 4765.01, rate_lock_id: "lock-1", rate_locked_until: "2026-09-13T10:00:00Z" });
  });

  it("writes no ratchet audit when the guarded update changed nothing (a concurrent request got there first)", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ exchange_rate: 15.6, mid_market_rate: 15 }));
    priceLockedAs(breakdown({ exchange_rate: 15.6, total_ghs: 4950 }));
    vi.mocked(ratchetLockRate).mockResolvedValue(false);

    const { pricing } = await run();

    expect(ratchetLockRate).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ action: "quote_lock_ratcheted" }));
    expect(pricing).toMatchObject({ exchange_rate: 15.01, rate_lock_id: "lock-1" });
  });

  it("degrades to live when the line cannot be priced under the lock (e.g. a currency missing from the snapshot)", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ exchange_rate: 14.49, fx_rates: { USD: 13.93 } }));
    vi.mocked(priceExtractionWith).mockImplementation(async (_c, _e, _q, _o, fx) =>
      fx ? { pricing: null, reason: "Locked exchange rate for GBP/GHS is missing from the rate lock." } : { pricing: breakdown(), reason: null },
    );

    const { pricing } = await run();

    expect(pricing).toMatchObject({ exchange_rate: 15.01 });
    expect(pricing?.rate_lock_id).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("applyRateLock — adoption", () => {
  it("looks the user up first, adopts the session's anonymous locks only on a miss, then looks again", async () => {
    vi.mocked(adoptSessionLocks).mockResolvedValue(["lock-a", "lock-b"]);
    vi.mocked(findActiveLock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(lock({ id: "lock-a", user_id: "user-1" }));

    const both = { userId: "user-1", sessionId: "sess-1" };
    const { pricing } = await run(both);

    expect(findActiveLock).toHaveBeenCalledTimes(2);
    expect(adoptSessionLocks).toHaveBeenCalledWith("sess-1", "user-1");
    expect(vi.mocked(findActiveLock).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(adoptSessionLocks).mock.invocationCallOrder[0]!);
    expect(vi.mocked(adoptSessionLocks).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(findActiveLock).mock.invocationCallOrder[1]!);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "quote_lock_adopted", entityId: "lock-a", actorId: "user-1" }));
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "quote_lock_adopted", entityId: "lock-b" }));
    expect(pricing?.rate_lock_id).toBe("lock-a");
    expect(insertQuoteLock).not.toHaveBeenCalled();
  });

  it("writes nothing when the signed-in user already holds a lock", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ user_id: "user-1" }));
    await run({ userId: "user-1", sessionId: "sess-1" });
    expect(adoptSessionLocks).not.toHaveBeenCalled();
    expect(findActiveLock).toHaveBeenCalledTimes(1);
  });

  it("mints when the miss stands after adopting nothing", async () => {
    await run({ userId: "user-1", sessionId: "sess-1" });
    expect(adoptSessionLocks).toHaveBeenCalledTimes(1);
    expect(findActiveLock).toHaveBeenCalledTimes(1);
    expect(insertQuoteLock).toHaveBeenCalledTimes(1);
  });

  it("skips adoption for a viewer with only one id", async () => {
    await run({ userId: "user-1", sessionId: null });
    await run(anon);
    expect(adoptSessionLocks).not.toHaveBeenCalled();
  });
});

describe("applyRateLock — failure policy", () => {
  it("rethrows a missing quote_locks table instead of degrading", async () => {
    vi.mocked(findActiveLock).mockRejectedValue(new Error("Failed to load quote lock: Could not find the table 'public.quote_locks' in the schema cache"));
    await expect(run()).rejects.toThrow(/quote_locks/);
  });

  it("rethrows a missing seeded constant — a deploy-before-migrate must go red", async () => {
    vi.mocked(loadQuoteConstants).mockRejectedValue(new QuoteConstantsMissingError(["rate_lock_hours"]));
    await expect(run()).rejects.toBeInstanceOf(QuoteConstantsMissingError);
  });

  it("degrades a transient constants failure to live pricing without minting", async () => {
    vi.mocked(loadQuoteConstants).mockRejectedValue(new Error("timeout"));
    const { pricing } = await run();
    expect(insertQuoteLock).not.toHaveBeenCalled();
    expect(pricing).toMatchObject({ exchange_rate: 15.01 });
    expect(pricing?.rate_lock_id).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it("degrades a transient lookup failure to live pricing and does NOT mint a duplicate", async () => {
    vi.mocked(findActiveLock).mockRejectedValue(new Error("Failed to load quote lock: timeout"));
    const { pricing } = await run();
    expect(insertQuoteLock).not.toHaveBeenCalled();
    expect(pricing).toMatchObject({ exchange_rate: 15.01 });
    expect(pricing?.rate_lock_id).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it("degrades any other lock failure to live pricing with an error logged", async () => {
    vi.mocked(insertQuoteLock).mockRejectedValue(new Error("Failed to create quote lock: timeout"));
    const { pricing } = await run();
    expect(pricing).toMatchObject({ exchange_rate: 15.01 });
    expect(pricing?.rate_lock_id).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("priceUnderExistingLock", () => {
  const input = { viewer: anon, extraction, extractionCacheId: CACHE_ID, quantity: 1, overrides: null };

  it("prices under the viewer's existing lock", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock({ exchange_rate: 14.49, mid_market_rate: 13.93 }));
    priceLockedAs(breakdown({ exchange_rate: 14.49, total_ghs: 4608.59 }));

    const { pricing } = await priceUnderExistingLock(input);

    expect(pricing).toMatchObject({ exchange_rate: 14.49, total_ghs: 4608.59, rate_lock_id: "lock-1", rate_locked_until: "2026-09-13T10:00:00Z" });
    expect(insertQuoteLock).not.toHaveBeenCalled();
  });

  it("prices live and never mints when the viewer has no lock", async () => {
    const { pricing } = await priceUnderExistingLock(input);
    expect(findActiveLock).toHaveBeenCalledTimes(1);
    expect(insertQuoteLock).not.toHaveBeenCalled();
    expect(loadQuoteConstants).not.toHaveBeenCalled();
    expect(pricing).toMatchObject({ exchange_rate: 15.01 });
    expect(pricing?.rate_lock_id).toBeUndefined();
  });
});

describe("priceLowerOf — admin mode (no ratchet)", () => {
  it("returns plain live pricing without lock fields when live wins, and leaves the lock alone", async () => {
    const live = breakdown();
    const pricing = await priceLowerOf({
      lock: lock({ exchange_rate: 15.6, mid_market_rate: 15 }),
      live,
      priceAt: async () => breakdown({ exchange_rate: 15.6, total_ghs: 4950 }),
      onLiveWins: { ratchet: false },
    });
    expect(pricing).toEqual(live);
    expect(pricing.rate_lock_id).toBeUndefined();
    expect(ratchetLockRate).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns the locked pricing with lock fields when locked wins", async () => {
    const pricing = await priceLowerOf({
      lock: lock({ exchange_rate: 14.49, mid_market_rate: 13.93 }),
      live: breakdown(),
      priceAt: async () => breakdown({ exchange_rate: 14.49, total_ghs: 4608.59 }),
      onLiveWins: { ratchet: false },
    });
    expect(pricing).toMatchObject({ exchange_rate: 14.49, total_ghs: 4608.59, rate_lock_id: "lock-1", rate_locked_until: "2026-09-13T10:00:00Z" });
  });
});

describe("resolveLockForOrder / consumeQuoteLocksForOrder", () => {
  it("returns the active lock and never mints", async () => {
    vi.mocked(findActiveLock).mockResolvedValue(lock());
    expect(await resolveLockForOrder(anon, CACHE_ID)).toMatchObject({ id: "lock-1" });
    expect(insertQuoteLock).not.toHaveBeenCalled();
  });

  it("returns null when the lock has expired (query finds none)", async () => {
    expect(await resolveLockForOrder(anon, CACHE_ID)).toBeNull();
    expect(insertQuoteLock).not.toHaveBeenCalled();
  });

  it("consumes every sibling lock on the extraction and audits each, marking which one priced the order", async () => {
    vi.mocked(consumeActiveLocks).mockResolvedValue(["lock-1", "lock-2"]);
    const viewer = { userId: "user-1", sessionId: "sess-1" };

    const ids = await consumeQuoteLocksForOrder({ viewer, extractionCacheId: CACHE_ID, lockId: "lock-1", orderId: "order-9", actorId: "user-1", exchangeRate: 14.49 });

    expect(ids).toEqual(["lock-1", "lock-2"]);
    expect(consumeActiveLocks).toHaveBeenCalledWith(viewer, CACHE_ID, "order-9", expect.any(String));
    expect(consumeLock).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "quote_lock_consumed", entityId: "lock-1", actorId: "user-1",
      metadata: { exchange_rate: 14.49, order_id: "order-9", priced_under: true },
    }));
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "quote_lock_consumed", entityId: "lock-2", metadata: expect.objectContaining({ priced_under: false }),
    }));
  });

  it("falls back to consuming the priced lock by id when the sibling sweep did not cover it", async () => {
    vi.mocked(consumeActiveLocks).mockResolvedValue([]);
    const ids = await consumeQuoteLocksForOrder({ viewer: anon, extractionCacheId: null, lockId: "lock-1", orderId: "order-9", actorId: "user-1", exchangeRate: 14.49 });
    expect(consumeActiveLocks).not.toHaveBeenCalled();
    expect(consumeLock).toHaveBeenCalledWith("lock-1", "order-9", expect.any(String));
    expect(ids).toEqual(["lock-1"]);
  });
});
