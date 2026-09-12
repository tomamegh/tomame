import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/db/queries/pricing-constants", () => ({
  getPricingConstantsMap: vi.fn(),
}));
vi.mock("@/lib/exchange-rates/service", () => ({
  RATE_CURRENCIES: ["USD", "GBP", "CNY"] as const,
  getRate: vi.fn(),
  getGhsRate: vi.fn(),
}));

import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { getRate } from "@/lib/exchange-rates/service";
import { APIError } from "@/lib/auth/api-helpers";
import { applyFxBuffer, parseBaseCurrency, getFxRateQuote } from "../fx-rate.service";

const mockGetRate = vi.mocked(getRate);
const mockGetConstants = vi.mocked(getPricingConstantsMap);

function rateRow(overrides: Partial<{ base_currency: string; rate: number; fetched_at: string }> = {}) {
  return {
    id: "rate-1",
    base_currency: "USD",
    target_currency: "GHS",
    rate: 12.5,
    provider: "exchangerate-api",
    fetched_at: "2026-09-12T06:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-12T06:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRate.mockResolvedValue(rateRow());
  mockGetConstants.mockResolvedValue({ fx_buffer_pct: 0.04 });
});

describe("parseBaseCurrency", () => {
  it("defaults to USD when the caller sends no base", () => {
    expect(parseBaseCurrency(null)).toBe("USD");
    expect(parseBaseCurrency(undefined)).toBe("USD");
    expect(parseBaseCurrency("  ")).toBe("USD");
  });

  it("accepts a supported currency in any casing or padding", () => {
    expect(parseBaseCurrency("gbp")).toBe("GBP");
    expect(parseBaseCurrency(" cny ")).toBe("CNY");
  });

  it("rejects a currency we store no rate for with a 400", () => {
    expect(() => parseBaseCurrency("EUR")).toThrowError(APIError);
    try {
      parseBaseCurrency("EUR");
    } catch (error) {
      expect((error as APIError).statusCode).toBe(400);
    }
  });

  it("does not echo the rejected input back to the caller", () => {
    try {
      parseBaseCurrency("<script>");
    } catch (error) {
      expect((error as APIError).message).not.toContain("<script>");
    }
  });
});

describe("applyFxBuffer", () => {
  it("marks the mid-market rate UP by the buffer, matching the quote calculator", () => {
    // calculator.ts:130 — roundTo2(midMarket * (1 + fxBufferPct))
    expect(applyFxBuffer(12.5, 0.04)).toBe(13);
    expect(applyFxBuffer(10, 0.1)).toBe(11);
  });

  it("rounds to 2dp before anything downstream multiplies by it", () => {
    expect(applyFxBuffer(12.3456, 0.04)).toBe(12.84);
  });

  it("returns the mid-market rate untouched when the buffer is zero", () => {
    expect(applyFxBuffer(12.5, 0)).toBe(12.5);
  });
});

describe("getFxRateQuote", () => {
  it("returns the stored mid-market rate alongside the buffered applied rate", async () => {
    const quote = await getFxRateQuote("USD");

    expect(quote).toEqual({
      base: "USD",
      target: "GHS",
      mid_market_rate: 12.5,
      applied_rate: 13,
      fetched_at: "2026-09-12T06:00:00.000Z",
    });
  });

  it("quotes the requested currency, not always USD", async () => {
    mockGetRate.mockResolvedValue(rateRow({ base_currency: "GBP", rate: 16 }));

    const quote = await getFxRateQuote("gbp");

    expect(mockGetRate).toHaveBeenCalledWith("GBP");
    expect(quote.base).toBe("GBP");
    expect(quote.applied_rate).toBe(16.64);
  });

  it("uses the admin-set buffer from pricing_constants rather than a hard-coded one", async () => {
    mockGetConstants.mockResolvedValue({ fx_buffer_pct: 0.1 });

    await expect(getFxRateQuote("USD")).resolves.toMatchObject({ applied_rate: 13.75 });
  });

  it("falls back to the default buffer when pricing_constants read fails transiently", async () => {
    mockGetConstants.mockRejectedValue(new Error("connection reset"));

    // Same fallback the calculator makes, so pill and quote still agree.
    await expect(getFxRateQuote("USD")).resolves.toMatchObject({ applied_rate: 13 });
  });

  it("rethrows when the pricing_constants table is missing entirely", async () => {
    mockGetConstants.mockRejectedValue(
      new Error("Failed to load pricing constants: Could not find the table 'public.pricing_constants' in the schema cache"),
    );

    await expect(getFxRateQuote("USD")).rejects.toThrow(/could not find the table/i);
  });

  it("rethrows when the exchange_rates relation is missing entirely", async () => {
    mockGetRate.mockRejectedValue({ code: "42P01", message: 'relation "exchange_rates" does not exist' });

    await expect(getFxRateQuote("USD")).rejects.toThrow(/does not exist/i);
  });

  it("returns 503 when no rate has been stored for the currency yet", async () => {
    mockGetRate.mockResolvedValue(null);

    await expect(getFxRateQuote("CNY")).rejects.toMatchObject({ statusCode: 503 });
  });

  it("returns 503 rather than a nonsense rate when the stored value is unusable", async () => {
    mockGetRate.mockResolvedValue(rateRow({ rate: 0 }));

    await expect(getFxRateQuote("USD")).rejects.toMatchObject({ statusCode: 503 });
  });

  it("rejects an unsupported base before touching the database", async () => {
    await expect(getFxRateQuote("EUR")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetRate).not.toHaveBeenCalled();
  });
});
