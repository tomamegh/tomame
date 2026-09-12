import "server-only";

import { APIError } from "@/lib/auth/api-helpers";
import { RATE_CURRENCIES, getRate } from "@/lib/exchange-rates/service";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { DEFAULT_FX_BUFFER_PCT } from "@/config/pricing";
// Reused rather than re-implemented so "missing table fails loudly" stays a
// single definition. It is a pure classifier; it belongs in a shared lib module
// eventually, not in the marketing feature.
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { logger } from "@/lib/logger";

/** Every stored rate is quoted against GHS. */
export const FX_TARGET_CURRENCY = "GHS";

export type RateCurrency = (typeof RATE_CURRENCIES)[number];

export interface FxRateQuote {
  base: RateCurrency;
  target: typeof FX_TARGET_CURRENCY;
  /** The provider's raw rate, exactly as stored in `exchange_rates`. */
  mid_market_rate: number;
  /** What the quote engine actually charges at: mid-market + FX buffer. */
  applied_rate: number;
  /** When the provider rate was pulled (ISO 8601). */
  fetched_at: string;
}

/**
 * Validate a caller-supplied base currency against the currencies we actually
 * store rates for. Absent/empty defaults to USD.
 *
 * @throws {APIError} 400 when the currency is not one of `RATE_CURRENCIES`.
 */
export function parseBaseCurrency(input: string | null | undefined): RateCurrency {
  const candidate = (input ?? "").trim().toUpperCase();
  if (!candidate) return "USD";

  const match = RATE_CURRENCIES.find((currency) => currency === candidate);
  if (!match) {
    // Deliberately does not echo the input back into the response body.
    throw new APIError(400, `Unsupported base currency. Supported: ${RATE_CURRENCIES.join(", ")}`);
  }
  return match;
}

/** Same rounding the calculator uses — src/lib/pricing/calculator.ts:82-84. */
function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Apply the FX buffer to a mid-market rate.
 *
 * Matched verbatim to `PricingCalculator.loadFxRate` —
 * src/lib/pricing/calculator.ts:130:
 *   `this.appliedRate = PricingCalculator.roundTo2(midMarket * (1 + this.fxBufferPct));`
 * The buffer marks the rate UP (customers pay more GHS per USD) and the result
 * is rounded to 2dp before anything downstream multiplies by it. Do not
 * re-derive this anywhere: the nav pill must show the rate the quote charges at.
 */
export function applyFxBuffer(midMarketRate: number, fxBufferPct: number): number {
  return roundTo2(midMarketRate * (1 + fxBufferPct));
}

/** Soft-fallback guard: let a missing relation through, swallow everything else. */
function rethrowIfSchemaMissing(error: unknown): void {
  if (isSchemaMissingError(error)) throw error;
}

/**
 * The admin-controlled buffer. A missing `pricing_constants` table rethrows
 * (deploy-before-migration must be loud). A transient read failure falls back
 * to `DEFAULT_FX_BUFFER_PCT`, which is exactly what the calculator does in the
 * same situation (calculator.ts:107, pricing.service.ts:26), so the pill and
 * the quote still agree.
 */
async function loadFxBufferPct(): Promise<number> {
  try {
    const constants = await getPricingConstantsMap();
    return constants.fx_buffer_pct ?? DEFAULT_FX_BUFFER_PCT;
  } catch (error: unknown) {
    rethrowIfSchemaMissing(error);
    logger.warn("fx-rate: pricing constants unavailable, using default FX buffer", {
      error: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_FX_BUFFER_PCT;
  }
}

/**
 * The public FX quote behind the nav pill.
 *
 * Missing-row policy: a base currency with no stored rate yet is a 503, not a
 * null-rate 200. That is the same call `PricingCalculator.loadFxRate` makes
 * (calculator.ts:124-127) — if we cannot price at it, we do not display it.
 *
 * Caveat worth knowing: `getRate` (exchange-rates/service.ts:22-25) logs and
 * returns `null` on any PostgREST failure, so a missing `exchange_rates` table
 * currently reaches us as "no rate" and surfaces as that 503 rather than a
 * rethrow. The guard below keeps the loud behaviour for the day that query
 * starts propagating its errors.
 *
 * @throws {APIError} 400 for an unsupported base, 503 when no rate is stored.
 */
export async function getFxRateQuote(baseInput?: string | null): Promise<FxRateQuote> {
  const base = parseBaseCurrency(baseInput);

  const [rateRow, fxBufferPct] = await Promise.all([
    getRate(base).catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      return null;
    }),
    loadFxBufferPct(),
  ]);

  // `maybeSingle()` yields null with no row, and the query casts the result, so
  // neither the row nor a usable number is guaranteed by the type alone.
  const midMarketRate = Number(rateRow?.rate);
  if (!rateRow || !Number.isFinite(midMarketRate) || midMarketRate <= 0) {
    throw new APIError(503, `Exchange rate for ${base}/${FX_TARGET_CURRENCY} not available. Please try again later.`);
  }

  return {
    base,
    target: FX_TARGET_CURRENCY,
    mid_market_rate: midMarketRate,
    applied_rate: applyFxBuffer(midMarketRate, fxBufferPct),
    fetched_at: rateRow.fetched_at ?? rateRow.updated_at,
  };
}
