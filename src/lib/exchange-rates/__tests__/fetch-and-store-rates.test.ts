import { beforeEach, describe, expect, it, vi } from "vitest";

const upserts: Array<Record<string, unknown>> = [];
let failUpsertFor: string | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (row.base_currency === failUpsertFor) return { data: null, error: { message: "boom" } };
            upserts.push(row);
            return { data: { ...row, id: "x" }, error: null };
          },
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { crossRatesToGhs, ExchangeRateApiProvider } from "../exchange-rate-api";
import { FreeCurrencyProvider } from "../freecurrency";
import { fetchAndStoreRates, RATE_CURRENCIES } from "../service";
import type { ExchangeRateProvider } from "../types";

const USD_TABLE = { GHS: 12.28, GBP: 0.75, CNY: 7.1, EUR: 0.86, CAD: 1.37, AUD: 1.52, JPY: 150 };

function provider(name: string, impl: (currencies: string[]) => Promise<Map<string, number>>): ExchangeRateProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    name,
    calls,
    getRate: async () => { throw new Error("per-currency path must not be used"); },
    getRates: async (c) => { calls.push([...c]); return impl(c); },
  };
}

beforeEach(() => {
  upserts.length = 0;
  failUpsertFor = null;
  vi.unstubAllGlobals();
});

describe("crossRatesToGhs", () => {
  it("takes USD→GHS directly and crosses the rest through the USD table", () => {
    const rates = crossRatesToGhs(USD_TABLE, [...RATE_CURRENCIES]);
    expect(rates.get("USD")).toBe(12.28);
    expect(rates.get("GBP")).toBeCloseTo(12.28 / 0.75, 10);
    expect(rates.get("CNY")).toBeCloseTo(12.28 / 7.1, 10);
    expect(rates.size).toBe(RATE_CURRENCIES.length);
  });

  it("is empty without a GHS rate and skips currencies the table lacks", () => {
    expect(crossRatesToGhs({ GBP: 0.75 }, ["USD", "GBP"]).size).toBe(0);
    const partial = crossRatesToGhs({ GHS: 12, GBP: 0 }, ["USD", "GBP", "XXX"]);
    expect([...partial.keys()]).toEqual(["USD"]);
  });
});

describe("providers make one request per refresh", () => {
  it("exchangerate-api fetches only the USD table", async () => {
    process.env.EXCHANGE_RATE_API_KEY = "k";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ result: "success", conversion_rates: USD_TABLE }) }));
    vi.stubGlobal("fetch", fetchMock);
    const rates = await new ExchangeRateApiProvider().getRates([...RATE_CURRENCIES]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/latest\/USD$/);
    expect(rates.get("EUR")).toBeCloseTo(12.28 / 0.86, 10);
  });

  it("freecurrencyapi asks for GHS plus every base against USD in one call", async () => {
    process.env.FREECURRENCY_API_KEY = "k";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: USD_TABLE }) }));
    vi.stubGlobal("fetch", fetchMock);
    const rates = await new FreeCurrencyProvider().getRates([...RATE_CURRENCIES]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("base_currency=USD");
    expect(url).toContain("currencies=GHS,GBP,CNY,EUR,CAD,AUD");
    expect(rates.get("CAD")).toBeCloseTo(12.28 / 1.37, 10);
  });
});

describe("fetchAndStoreRates", () => {
  it("stores every currency from one call to the primary and never consults the fallback", async () => {
    const primary = provider("primary", async () => crossRatesToGhs(USD_TABLE, [...RATE_CURRENCIES]));
    const fallback = provider("fallback", async () => { throw new Error("should not run"); });
    const result = await fetchAndStoreRates([primary, fallback]);
    expect(result).toEqual({ success: true, updated: [...RATE_CURRENCIES], errors: [] });
    expect(primary.calls).toEqual([[...RATE_CURRENCIES]]);
    expect(fallback.calls).toEqual([]);
    expect(upserts.map((u) => u.base_currency)).toEqual([...RATE_CURRENCIES]);
    expect(upserts.every((u) => u.provider === "primary" && u.target_currency === "GHS")).toBe(true);
  });

  it("asks the fallback only for what the primary could not give", async () => {
    const primary = provider("primary", async () => new Map([["USD", 12.28], ["GBP", 16.3]]));
    const fallback = provider("fallback", async (c) => new Map(c.map((x) => [x, 1])));
    const result = await fetchAndStoreRates([primary, fallback]);
    expect(result.success).toBe(true);
    expect(fallback.calls).toEqual([["CNY", "EUR", "CAD", "AUD"]]);
    expect(upserts.find((u) => u.base_currency === "GBP")?.provider).toBe("primary");
    expect(upserts.find((u) => u.base_currency === "CNY")?.provider).toBe("fallback");
  });

  it("a thrown primary hands everything to the fallback; a currency nobody has is the only error", async () => {
    const primary = provider("primary", async () => { throw new Error("quota"); });
    const fallback = provider("fallback", async (c) => new Map(c.filter((x) => x !== "AUD").map((x) => [x, 2])));
    const result = await fetchAndStoreRates([primary, fallback]);
    expect(result.success).toBe(false);
    expect(result.updated).toEqual(["USD", "GBP", "CNY", "EUR", "CAD"]);
    expect(result.errors).toEqual(["AUD: primary: quota; fallback: no AUD→GHS rate"]);
  });

  it("a failed upsert is retried through the next provider and reported", async () => {
    failUpsertFor = "EUR";
    const primary = provider("primary", async () => crossRatesToGhs(USD_TABLE, [...RATE_CURRENCIES]));
    const fallback = provider("fallback", async (c) => new Map(c.map((x) => [x, 1])));
    const result = await fetchAndStoreRates([primary, fallback]);
    expect(fallback.calls).toEqual([["EUR"]]);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(["EUR: primary: DB upsert failed; fallback: DB upsert failed"]);
  });

  it("reports no provider configured", async () => {
    const result = await fetchAndStoreRates([]);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/No exchange-rate provider configured/);
  });
});
