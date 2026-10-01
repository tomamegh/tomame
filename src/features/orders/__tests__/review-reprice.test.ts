import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "http://localhost:3000" } } }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/orders/services/orders.service", () => ({ getOrderById: vi.fn() }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn(async () => CALC) }));
vi.mock("@/db/queries/quote-locks", () => ({
  getQuoteLockById: vi.fn(),
  findActiveLock: vi.fn(),
  insertQuoteLock: vi.fn(),
  ratchetLockRate: vi.fn(),
  adoptSessionLocks: vi.fn(),
  consumeLock: vi.fn(),
  consumeActiveLocks: vi.fn(),
}));
vi.mock("@/lib/exchange-rates/service", () => ({ listGhsRates: vi.fn(async () => ({ USD: 14.43 })) }));
vi.mock("@/features/extraction/quote.service", () => ({ priceExtractionWith: vi.fn() }));
vi.mock("@/features/quotes/services/quote-constants.service", () => {
  class QuoteConstantsMissingError extends Error {}
  return { QuoteConstantsMissingError, loadQuoteConstants: vi.fn() };
});
vi.mock("@/features/quotes/services/delivery-eta.service", () => ({ loadDeliveryWindow: vi.fn() }));
vi.mock("@/lib/supabase/errors", () => ({ isSchemaMissingError: () => false }));

// The admin client serves three chains: orders.update (captured), payments.update, auth.admin.
const captured: { orderUpdates: Record<string, unknown> | null } = { orderUpdates: null };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: null, error: null }) } },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const name of ["eq", "filter", "select"]) chain[name] = () => chain;
      chain.update = (updates: Record<string, unknown>) => {
        if (table === "orders") captured.orderUpdates = updates;
        return chain;
      };
      chain.single = async () => ({ data: { ...ORDER, ...captured.orderUpdates }, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
      return chain;
    },
  }),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderById } from "@/features/orders/services/orders.service";
import { getQuoteLockById, ratchetLockRate, type QuoteLockRow } from "@/db/queries/quote-locks";
import type { PricingBreakdown, FxOverride } from "@/lib/pricing";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "../types";
import { reviewOrder } from "../services/orders.review.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";

const calculate = vi.fn<(input: unknown, fx: FxOverride | null) => Promise<PricingBreakdown>>();
const CALC = { calculate };

function breakdown(overrides: Partial<PricingBreakdown> = {}): PricingBreakdown {
  return {
    pricing_method: "flat_rate", pricing_group: "phones", item_price: 100, item_currency: "USD",
    item_price_usd: 100, quantity: 1, subtotal_usd: 100, exchange_rate: 15.01, mid_market_rate: 14.43,
    tax_percentage: 0.1, tax_usd: 10, value_fee_percentage: 0.05, value_fee_usd: 5, flat_rate_ghs: 500,
    total_ghs: 2226.15, total_pesewas: 222615, fee_calculation_note: "flat rate: Phones", ...overrides,
  };
}

const ORDER = {
  id: "order-9", user_id: "user-1", needs_review: true, quantity: 1, estimated_price_usd: 100, origin_country: "USA",
  product_name: "Phone", product_image_url: null, extraction_metadata: null, review_reasons: ["Automatic extraction was incomplete."],
  pricing: { ...breakdown({ pricing_method: "needs_review" }), rate_lock_id: "lock-1", rate_locked_until: "2026-09-13T10:00:00Z" },
} as unknown as Order;

function lock(overrides: Partial<QuoteLockRow> = {}): QuoteLockRow {
  return {
    id: "lock-1", user_id: "user-1", session_id: null, extraction_cache_id: null, quantity: 1,
    exchange_rate: 14.49, mid_market_rate: 13.93, fx_rates: { USD: 13.93 }, pricing: breakdown(),
    locked_at: "2026-09-12T10:00:00Z", expires_at: new Date(Date.now() + 3600_000).toISOString(),
    consumed_by_order_id: "order-9", consumed_at: "2026-09-12T11:00:00Z", created_at: "2026-09-12T10:00:00Z", ...overrides,
  };
}

const admin = { id: "admin-1", role: "admin" } as unknown as PlatformUser;
const client = {} as SupabaseClient;

/** Live pass returns the default; a pass under the lock returns `locked`. */
function priceLockedAs(locked: PricingBreakdown) {
  calculate.mockImplementation(async (_input, fx) => (fx ? locked : breakdown()));
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.orderUpdates = null;
  vi.mocked(getOrderById).mockResolvedValue(ORDER);
  calculate.mockResolvedValue(breakdown());
});

describe("reviewOrder(approve) — re-pricing under the order's lock", () => {
  it("expired lock → priced live, no lock fields", async () => {
    vi.mocked(getQuoteLockById).mockResolvedValue(lock({ expires_at: "2020-01-01T00:00:00Z" }));

    await reviewOrder(client, admin, "order-9", { action: "approve" });

    expect(getQuoteLockById).toHaveBeenCalledWith("lock-1");
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledWith(expect.objectContaining({ itemPriceUsd: 100, quantity: 1, region: "usa" }), null);
    const pricing = captured.orderUpdates?.pricing as PricingBreakdown;
    expect(pricing).toMatchObject({ exchange_rate: 15.01, total_ghs: 2226.15, pricing_method: "flat_rate" });
    expect(pricing.rate_lock_id).toBeUndefined();
    expect(pricing.rate_locked_until).toBeUndefined();
  });

  it("unexpired lock whose total is HIGHER than live → live wins, no lock fields, and the consumed lock is left alone", async () => {
    vi.mocked(getQuoteLockById).mockResolvedValue(lock({ exchange_rate: 15.6, mid_market_rate: 15 }));
    priceLockedAs(breakdown({ exchange_rate: 15.6, mid_market_rate: 15, total_ghs: 2294 }));

    await reviewOrder(client, admin, "order-9", { action: "approve" });

    expect(calculate).toHaveBeenNthCalledWith(2, expect.anything(), { exchange_rate: 15.6, mid_market_rate: 15, cross_rates: { USD: 13.93 } });
    const pricing = captured.orderUpdates?.pricing as PricingBreakdown;
    expect(pricing).toMatchObject({ exchange_rate: 15.01, total_ghs: 2226.15 });
    expect(pricing.rate_lock_id).toBeUndefined();
    expect(ratchetLockRate).not.toHaveBeenCalled();
  });

  it("unexpired lock whose total is LOWER than live → locked pricing from the lock ROW, lock fields attached", async () => {
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    vi.mocked(getQuoteLockById).mockResolvedValue(lock({ exchange_rate: 14.49, mid_market_rate: 13.93, expires_at: expiresAt }));
    priceLockedAs(breakdown({ exchange_rate: 14.49, mid_market_rate: 13.93, total_ghs: 2166.35 }));

    await reviewOrder(client, admin, "order-9", { action: "approve", updates: { estimated_price_usd: 120 } });

    expect(calculate).toHaveBeenNthCalledWith(1, expect.objectContaining({ itemPriceUsd: 120 }), null);
    expect(calculate).toHaveBeenNthCalledWith(2, expect.objectContaining({ itemPriceUsd: 120 }), { exchange_rate: 14.49, mid_market_rate: 13.93, cross_rates: { USD: 13.93 } });
    const pricing = captured.orderUpdates?.pricing as PricingBreakdown;
    expect(pricing).toMatchObject({ exchange_rate: 14.49, total_ghs: 2166.35, rate_lock_id: "lock-1", rate_locked_until: expiresAt });
  });

  it("missing lock row → live, no lock fields", async () => {
    vi.mocked(getQuoteLockById).mockResolvedValue(null);
    await reviewOrder(client, admin, "order-9", { action: "approve" });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect((captured.orderUpdates?.pricing as PricingBreakdown).rate_lock_id).toBeUndefined();
  });

  it("an order never priced under a lock does not look one up", async () => {
    vi.mocked(getOrderById).mockResolvedValue({ ...ORDER, pricing: breakdown({ pricing_method: "needs_review" }) } as unknown as Order);
    await reviewOrder(client, admin, "order-9", { action: "approve" });
    expect(getQuoteLockById).not.toHaveBeenCalled();
    expect(calculate).toHaveBeenCalledTimes(1);
  });
});

describe("reviewOrder(approve) — store shipping override", () => {
  const noLock = (o: Partial<Order> = {}) =>
    ({ ...ORDER, pricing: breakdown({ pricing_method: "needs_review" }), ...o }) as unknown as Order;

  it("re-prices with the admin's per-unit figure in the listing currency, and audits from → to", async () => {
    vi.mocked(getOrderById).mockResolvedValue(noLock({
      quantity: 2,
      origin_country: "UK",
      extraction_metadata: { platform: "ebay", product: { currency: null } } as unknown as Order["extraction_metadata"],
    }));

    await reviewOrder(client, admin, "order-9", { action: "approve", updates: { store_shipping: 3.5 } });

    expect(calculate).toHaveBeenCalledWith(
      expect.objectContaining({ storeShipping: 3.5, storeShippingCurrency: "GBP", quantity: 2 }),
      null,
    );
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "order_review_approved",
      metadata: expect.objectContaining({
        storeShippingChanged: true,
        store_shipping: { from: 0, to: 3.5, currency: "GBP", quantity: 2 },
      }),
    }));
  });

  it("keeps the quoted figure (and its currency) when the admin sends none", async () => {
    vi.mocked(getOrderById).mockResolvedValue(noLock({
      pricing: breakdown({ pricing_method: "needs_review", store_shipping: 24, store_shipping_currency: "USD" }),
    }));
    await reviewOrder(client, admin, "order-9", { action: "approve" });
    expect(calculate).toHaveBeenCalledWith(expect.objectContaining({ storeShipping: 24, storeShippingCurrency: "USD" }), null);
  });

  it("never adds shipping from the extraction snapshot that the order was not priced with", async () => {
    vi.mocked(getOrderById).mockResolvedValue(noLock({
      extraction_metadata: { platform: "ebay", product: { currency: "USD", store_shipping: 24 } } as unknown as Order["extraction_metadata"],
    }));
    await reviewOrder(client, admin, "order-9", { action: "approve" });
    expect(calculate).toHaveBeenCalledWith(expect.objectContaining({ storeShipping: null }), null);
  });

  it("an admin can lower it to 0 (seller combines shipping)", async () => {
    vi.mocked(getOrderById).mockResolvedValue(noLock({
      pricing: breakdown({ pricing_method: "needs_review", store_shipping: 24, store_shipping_currency: "USD" }),
    }));
    await reviewOrder(client, admin, "order-9", { action: "approve", updates: { store_shipping: 0 } });
    expect(calculate).toHaveBeenCalledWith(expect.objectContaining({ storeShipping: 0, storeShippingCurrency: "USD" }), null);
  });
});

describe("reviewOrderSchema — store shipping", () => {
  it("accepts 0 and a sane figure, refuses negative, absurd and non-numeric", async () => {
    const { reviewOrderSchema } = await import("../schema");
    const parse = (v: unknown) => reviewOrderSchema.safeParse({ action: "approve", updates: { store_shipping: v } }).success;
    expect(parse(0)).toBe(true);
    expect(parse(12.5)).toBe(true);
    expect(parse(-1)).toBe(false);
    expect(parse(2_000.01)).toBe(false);
    expect(parse("12")).toBe(false);
    expect(parse(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
