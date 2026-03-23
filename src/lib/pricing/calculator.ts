import { APIError } from "@/lib/auth/api-helpers";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TAX_PERCENTAGE, DEFAULT_FX_BUFFER_PCT } from "@/config/pricing";
import {
  getCategoryPricing,
  isWeightExpression,
  resolveFlatRate,
} from "@/config/pricing-categories";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PricingInput {
  itemPriceUsd: number;
  quantity: number;
  category?: string | null;
  weightLbs?: number | null;
}

export interface PricingBreakdown {
  pricing_method: "flat_rate" | "weight_expression" | "needs_review";
  pricing_group: string | null;
  item_price_usd: number;
  quantity: number;
  subtotal_usd: number;
  exchange_rate: number;
  mid_market_rate: number;
  tax_percentage: number;
  tax_usd: number;
  value_fee_percentage: number;
  value_fee_usd: number;
  flat_rate_ghs: number;
  total_ghs: number;
  total_pesewas: number;
  flat_rate_expression?: string;
  weight_lbs?: number;
  review_reason?: string;
}

// ── Calculator ───────────────────────────────────────────────────────────────

export class PricingCalculator {
  private midMarketRate: number | null = null;
  private appliedRate: number | null = null;

  private static roundTo2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** Fetch and cache the FX rate. Throws 503 if unavailable. */
  async loadFxRate(): Promise<void> {
    const midMarket = await getGhsRate("USD");
    if (midMarket == null) {
      throw new APIError(
        503,
        "Exchange rate for USD/GHS not available. Please try again later.",
      );
    }
    this.midMarketRate = midMarket;
    this.appliedRate = PricingCalculator.roundTo2(
      midMarket * (1 + DEFAULT_FX_BUFFER_PCT),
    );
  }

  /** Calculate the full pricing breakdown for an order. */
  async calculate(input: PricingInput): Promise<PricingBreakdown> {
    if (this.appliedRate == null) {
      await this.loadFxRate();
    }

    const r2 = PricingCalculator.roundTo2;
    const fxRate = this.appliedRate!;
    const midRate = this.midMarketRate!;

    const { itemPriceUsd, quantity, category } = input;
    const subtotalUsd = r2(itemPriceUsd * quantity);
    const taxUsd = r2(subtotalUsd * TAX_PERCENTAGE);

    const catPricing = getCategoryPricing(category);

    // No pricing group → needs_review
    if (!catPricing) {
      logger.info("No pricing group for category, flagging for review", {
        category,
      });
      return this.buildReview({
        input,
        subtotalUsd,
        taxUsd,
        fxRate,
        midRate,
        group: null,
        valueFeePercentage: 0,
        valueFeeUsd: 0,
        reason: category
          ? `Category "${category}" has no pricing configuration`
          : "Product category could not be determined",
      });
    }

    const { group, pricing } = catPricing;
    const valueFeeUsd = r2(subtotalUsd * pricing.value_percentage);
    const rawFlatRate = pricing.flat_rate_ghs;

    // Expression that needs weight but weight not provided → needs_review
    if (isWeightExpression(rawFlatRate) && input.weightLbs == null) {
      return this.buildReview({
        input,
        subtotalUsd,
        taxUsd,
        fxRate,
        midRate,
        group,
        valueFeePercentage: pricing.value_percentage,
        valueFeeUsd,
        reason: `Category "${pricing.name}" requires weight but none was provided`,
      });
    }

    const resolvedFlatRate = resolveFlatRate(rawFlatRate, input.weightLbs);
    if (resolvedFlatRate == null) {
      return this.buildReview({
        input,
        subtotalUsd,
        taxUsd,
        fxRate,
        midRate,
        group,
        valueFeePercentage: pricing.value_percentage,
        valueFeeUsd,
        reason: `Could not resolve flat rate for "${pricing.name}"`,
      });
    }

    const flatRateGhs = r2(resolvedFlatRate);
    const usdComponentGhs = r2((subtotalUsd + taxUsd + valueFeeUsd) * fxRate);
    const totalGhs = r2(usdComponentGhs + flatRateGhs);
    const totalPesewas = Math.round(totalGhs * 100);

    const isExpression = isWeightExpression(rawFlatRate);

    return {
      pricing_method: isExpression ? "weight_expression" : "flat_rate",
      pricing_group: group,
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      exchange_rate: fxRate,
      mid_market_rate: midRate,
      tax_percentage: TAX_PERCENTAGE,
      tax_usd: taxUsd,
      value_fee_percentage: pricing.value_percentage,
      value_fee_usd: valueFeeUsd,
      flat_rate_ghs: flatRateGhs,
      total_ghs: totalGhs,
      total_pesewas: totalPesewas,
      ...(isExpression && {
        flat_rate_expression: rawFlatRate,
        weight_lbs: input.weightLbs!,
      }),
    };
  }

  private buildReview(opts: {
    input: PricingInput;
    subtotalUsd: number;
    taxUsd: number;
    fxRate: number;
    midRate: number;
    group: string | null;
    valueFeePercentage: number;
    valueFeeUsd: number;
    reason: string;
  }): PricingBreakdown {
    return {
      pricing_method: "needs_review",
      pricing_group: opts.group,
      item_price_usd: opts.input.itemPriceUsd,
      quantity: opts.input.quantity,
      subtotal_usd: opts.subtotalUsd,
      exchange_rate: opts.fxRate,
      mid_market_rate: opts.midRate,
      tax_percentage: TAX_PERCENTAGE,
      tax_usd: opts.taxUsd,
      value_fee_percentage: opts.valueFeePercentage,
      value_fee_usd: opts.valueFeeUsd,
      flat_rate_ghs: 0,
      total_ghs: 0,
      total_pesewas: 0,
      review_reason: opts.reason,
    };
  }
}
