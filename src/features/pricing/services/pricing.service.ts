import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TAX_PERCENTAGE, DEFAULT_FX_BUFFER_PCT } from "@/config/pricing";
import { getCategoryPricing } from "@/config/pricing-categories";

// ── Helpers ──────────────────────────────────────────────────────────────────

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Get the applied FX rate: mid-market rate × (1 + buffer).
 * Throws if no rate exists in DB (cron must have run first).
 */
async function getAppliedFxRate(
  baseCurrency: string,
): Promise<{ appliedRate: number; midMarketRate: number }> {
  const midMarketRate = await getGhsRate(baseCurrency);

  if (midMarketRate == null) {
    throw new APIError(
      503,
      `Exchange rate for ${baseCurrency}/GHS not available. Please try again later.`,
    );
  }

  return {
    midMarketRate,
    appliedRate: roundTo2(midMarketRate * (1 + DEFAULT_FX_BUFFER_PCT)),
  };
}

// ── Input type ───────────────────────────────────────────────────────────────

export interface CalculatePricingInput {
  itemPriceUsd: number;
  quantity: number;
  region: "USA" | "UK" | "CHINA";
  /** TomameCategory string from extraction */
  category?: string | null;
  /** Weight in lbs (from scraping) */
  weightLbs?: number;
  weightSource?: "scraped" | "category_default";
}

/**
 * Calculate the full pricing breakdown for an order.
 *
 * 1. Look up TomameCategory → pricing group
 *    - Not found → needs_review
 * 2. If flat_rate → freight is fixed GHS
 *    If weight_required:
 *      - No weight → needs_review
 *      - Has weight → freight = weight × per_weight_rate × fx_rate
 * 3. value_fee = subtotal × value_percentage
 * 4. tax = subtotal × TAX_PERCENTAGE
 * 5. total_ghs = (subtotal + tax + value_fee) × fx_rate + freight_ghs
 */
export async function calculatePricing(
  input: CalculatePricingInput,
): Promise<OrderPricingBreakdown> {
  const { itemPriceUsd, quantity, region, category } = input;

  // Resolve FX rate
  const currencyMap: Record<string, string> = {
    USA: "USD",
    UK: "GBP",
    CHINA: "CNY",
  };
  const baseCurrency = currencyMap[region] ?? "USD";
  const { appliedRate, midMarketRate } = await getAppliedFxRate(baseCurrency);

  const subtotalUsd = roundTo2(itemPriceUsd * quantity);
  const taxUsd = roundTo2(subtotalUsd * TAX_PERCENTAGE);

  // Look up category pricing
  const catPricing = getCategoryPricing(category);

  if (!catPricing) {
    logger.info("No pricing group for category, flagging for review", { category, region });
    return {
      pricing_method: "needs_review",
      pricing_group: null,
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      exchange_rate: appliedRate,
      mid_market_rate: midMarketRate,
      tax_percentage: TAX_PERCENTAGE,
      tax_usd: taxUsd,
      value_fee_percentage: 0,
      value_fee_usd: 0,
      total_ghs: 0,
      total_pesewas: 0,
      region,
      review_reason: category
        ? `Category "${category}" has no pricing configuration`
        : "Product category could not be determined",
    };
  }

  const { group, pricing } = catPricing;
  const valueFeeUsd = roundTo2(subtotalUsd * pricing.value_percentage);

  // ── Flat rate path ─────────────────────────────────────────────────────
  if (pricing.flat_rate_ghs != null) {
    const usdComponentGhs = roundTo2((subtotalUsd + taxUsd + valueFeeUsd) * appliedRate);
    const totalGhs = roundTo2(usdComponentGhs + pricing.flat_rate_ghs);
    const totalPesewas = Math.round(totalGhs * 100);

    return {
      pricing_method: "flat_rate",
      pricing_group: group,
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      exchange_rate: appliedRate,
      mid_market_rate: midMarketRate,
      tax_percentage: TAX_PERCENTAGE,
      tax_usd: taxUsd,
      value_fee_percentage: pricing.value_percentage,
      value_fee_usd: valueFeeUsd,
      total_ghs: totalGhs,
      total_pesewas: totalPesewas,
      region,
      flat_rate_ghs: pricing.flat_rate_ghs,
    };
  }

  // ── Weight-based path ──────────────────────────────────────────────────
  const weightLbs = input.weightLbs ?? null;
  const weightSource = input.weightSource ?? "scraped";

  if (pricing.weight_required && weightLbs == null) {
    return {
      pricing_method: "needs_review",
      pricing_group: group,
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      exchange_rate: appliedRate,
      mid_market_rate: midMarketRate,
      tax_percentage: TAX_PERCENTAGE,
      tax_usd: taxUsd,
      value_fee_percentage: pricing.value_percentage,
      value_fee_usd: valueFeeUsd,
      total_ghs: 0,
      total_pesewas: 0,
      region,
      review_reason: `Category "${pricing.name}" requires weight but none was provided`,
    };
  }

  const perLbRate = pricing.per_weight_rate_usd ?? 0;
  const freightUsd = roundTo2((weightLbs ?? 0) * perLbRate);
  const freightGhs = roundTo2(freightUsd * appliedRate);

  const usdComponentGhs = roundTo2((subtotalUsd + taxUsd + valueFeeUsd) * appliedRate);
  const totalGhs = roundTo2(usdComponentGhs + freightGhs);
  const totalPesewas = Math.round(totalGhs * 100);

  return {
    pricing_method: "weight_based",
    pricing_group: group,
    item_price_usd: itemPriceUsd,
    quantity,
    subtotal_usd: subtotalUsd,
    exchange_rate: appliedRate,
    mid_market_rate: midMarketRate,
    tax_percentage: TAX_PERCENTAGE,
    tax_usd: taxUsd,
    value_fee_percentage: pricing.value_percentage,
    value_fee_usd: valueFeeUsd,
    total_ghs: totalGhs,
    total_pesewas: totalPesewas,
    region,
    freight_usd: freightUsd,
    freight_ghs: freightGhs,
    weight_lbs: weightLbs ?? undefined,
    weight_source: weightSource,
    per_weight_rate_usd: perLbRate,
  };
}
