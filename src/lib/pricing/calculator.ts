import { APIError } from "@/lib/auth/api-helpers";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TAX_PERCENTAGE, DEFAULT_FX_BUFFER_PCT } from "@/config/pricing";
import {
  getCategoryPricing,
  isWeightExpression,
  resolveFlatRate,
  evaluateFlatRate,
} from "@/config/pricing-categories";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PricingConstants {
  freight_rate_per_lb: number;
  handling_fee_usd: number;
  minimum_tax_usd: number;
  fx_buffer_pct: number;
  tax_pct_usa: number;
  tax_pct_uk: number;
  tax_pct_china: number;
}

export interface PricingInput {
  itemPriceUsd: number;
  quantity: number;
  category?: string | null;
  weightLbs?: number | null;
  /** Region for tax tier lookup. Defaults to "usa". */
  region?: "usa" | "uk" | "china";
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
  private constants: PricingConstants | null = null;
  private categoryPricingMap: Map<string, PricingGroupRow> | null = null;

  private static roundTo2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** Inject DB-loaded pricing constants. Falls back to config defaults if not set. */
  setConstants(constants: PricingConstants): void {
    this.constants = constants;
  }

  /** Inject DB-loaded category→pricing group map. Falls back to JSON config if not set. */
  setCategoryPricing(map: Map<string, PricingGroupRow>): void {
    this.categoryPricingMap = map;
  }

  private get fxBufferPct(): number {
    return this.constants?.fx_buffer_pct ?? DEFAULT_FX_BUFFER_PCT;
  }

  private getTaxPercentage(region?: "usa" | "uk" | "china"): number {
    if (!this.constants) return TAX_PERCENTAGE;
    switch (region) {
      case "uk":
        return this.constants.tax_pct_uk;
      case "china":
        return this.constants.tax_pct_china;
      case "usa":
      default:
        return this.constants.tax_pct_usa;
    }
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
      midMarket * (1 + this.fxBufferPct),
    );
  }

  /**
   * Look up pricing for a category. Uses DB map if available, else falls back to JSON config.
   */
  private lookupCategoryPricing(category: string | null | undefined): {
    group: string;
    flat_rate_ghs: number | null;
    flat_rate_expression: string | null;
    value_percentage: number;
    value_percentage_high: number | null;
    value_threshold_usd: number | null;
    default_weight_lbs: number | null;
    requires_weight: boolean;
    name: string;
  } | null {
    if (!category) return null;

    // DB-loaded map takes priority
    if (this.categoryPricingMap) {
      const pg = this.categoryPricingMap.get(category);
      if (!pg) return null;
      return {
        group: pg.slug,
        flat_rate_ghs: pg.flat_rate_ghs,
        flat_rate_expression: pg.flat_rate_expression,
        value_percentage: pg.value_percentage,
        value_percentage_high: pg.value_percentage_high,
        value_threshold_usd: pg.value_threshold_usd,
        default_weight_lbs: pg.default_weight_lbs,
        requires_weight: pg.requires_weight,
        name: pg.name,
      };
    }

    // Fallback to JSON config
    const jsonPricing = getCategoryPricing(category);
    if (!jsonPricing) return null;
    const { group, pricing } = jsonPricing;
    return {
      group,
      flat_rate_ghs:
        typeof pricing.flat_rate_ghs === "number"
          ? pricing.flat_rate_ghs
          : null,
      flat_rate_expression:
        typeof pricing.flat_rate_ghs === "string"
          ? pricing.flat_rate_ghs
          : null,
      value_percentage: pricing.value_percentage,
      value_percentage_high: null,
      value_threshold_usd: null,
      default_weight_lbs: null,
      requires_weight: false,
      name: pricing.name,
    };
  }

  /** Calculate the full pricing breakdown for an order. */
  async calculate(input: PricingInput): Promise<PricingBreakdown> {
    if (this.appliedRate == null) {
      await this.loadFxRate();
    }

    const r2 = PricingCalculator.roundTo2;
    const fxRate = this.appliedRate!;
    const midRate = this.midMarketRate!;

    const { itemPriceUsd, quantity, category, region } = input;
    const subtotalUsd = r2(itemPriceUsd * quantity);
    const taxPct = this.getTaxPercentage(region);
    const rawTax = r2(subtotalUsd * taxPct);
    const minimumTax = this.constants?.minimum_tax_usd ?? 0;
    const taxUsd = Math.max(rawTax, minimumTax);

    const catPricing = this.lookupCategoryPricing(category);

    // No pricing group → needs_review
    if (!catPricing) {
      logger.info("No pricing group for category, flagging for review", {
        category,
      });
      return this.buildReview({
        input,
        subtotalUsd,
        taxPct,
        taxUsd,
        fxRate,
        midRate,
        group: null,
        valueFeePercentage: 0,
        valueFeeUsd: 0,
        reason: category
          ? `We don't have pricing set up for "${category}" products yet.`
          : "We couldn't determine the product category.",
      });
    }

    // Resolve value fee percentage (tiered if configured)
    let valueFeePercentage = catPricing.value_percentage;
    if (
      catPricing.value_threshold_usd != null &&
      catPricing.value_percentage_high != null &&
      subtotalUsd > catPricing.value_threshold_usd
    ) {
      valueFeePercentage = catPricing.value_percentage_high;
    }

    const valueFeeUsd = r2(subtotalUsd * valueFeePercentage);

    // Determine if this is a weight-expression pricing group
    const hasExpression = catPricing.flat_rate_expression != null;
    const hasFlatRate = catPricing.flat_rate_ghs != null;

    if (hasExpression) {
      // Weight-based pricing: try input weight → default weight → needs_review
      const effectiveWeight =
        input.weightLbs ?? catPricing.default_weight_lbs ?? null;

      if (effectiveWeight == null) {
        // requires_weight: reject with specific reason
        if (catPricing.requires_weight) {
          return this.buildReview({
            input,
            subtotalUsd,
            taxPct,
            taxUsd,
            fxRate,
            midRate,
            group: catPricing.group,
            valueFeePercentage,
            valueFeeUsd,
            reason: `This product requires weight information for shipping. ${catPricing.name} orders cannot be processed without weight.`,
          });
        }

        return this.buildReview({
          input,
          subtotalUsd,
          taxPct,
          taxUsd,
          fxRate,
          midRate,
          group: catPricing.group,
          valueFeePercentage,
          valueFeeUsd,
          reason: `We couldn't determine the weight of this product, which is needed to calculate shipping for ${catPricing.name.toLowerCase()}.`,
        });
      }

      const flatRateGhs = r2(
        evaluateFlatRate(catPricing.flat_rate_expression!, effectiveWeight),
      );
      const usdComponentGhs = r2(
        (subtotalUsd + taxUsd + valueFeeUsd) * fxRate,
      );
      const totalGhs = r2(usdComponentGhs + flatRateGhs);

      return {
        pricing_method: "weight_expression",
        pricing_group: catPricing.group,
        item_price_usd: itemPriceUsd,
        quantity,
        subtotal_usd: subtotalUsd,
        exchange_rate: fxRate,
        mid_market_rate: midRate,
        tax_percentage: taxPct,
        tax_usd: taxUsd,
        value_fee_percentage: valueFeePercentage,
        value_fee_usd: valueFeeUsd,
        flat_rate_ghs: flatRateGhs,
        total_ghs: totalGhs,
        total_pesewas: Math.round(totalGhs * 100),
        flat_rate_expression: catPricing.flat_rate_expression!,
        weight_lbs: effectiveWeight,
      };
    }

    if (hasFlatRate) {
      const flatRateGhs = r2(catPricing.flat_rate_ghs!);
      const usdComponentGhs = r2(
        (subtotalUsd + taxUsd + valueFeeUsd) * fxRate,
      );
      const totalGhs = r2(usdComponentGhs + flatRateGhs);

      return {
        pricing_method: "flat_rate",
        pricing_group: catPricing.group,
        item_price_usd: itemPriceUsd,
        quantity,
        subtotal_usd: subtotalUsd,
        exchange_rate: fxRate,
        mid_market_rate: midRate,
        tax_percentage: taxPct,
        tax_usd: taxUsd,
        value_fee_percentage: valueFeePercentage,
        value_fee_usd: valueFeeUsd,
        flat_rate_ghs: flatRateGhs,
        total_ghs: totalGhs,
        total_pesewas: Math.round(totalGhs * 100),
      };
    }

    // Should not reach here due to DB CHECK constraint, but handle gracefully
    return this.buildReview({
      input,
      subtotalUsd,
      taxPct,
      taxUsd,
      fxRate,
      midRate,
      group: catPricing.group,
      valueFeePercentage,
      valueFeeUsd,
      reason: `We couldn't calculate shipping for ${catPricing.name.toLowerCase()}.`,
    });
  }

  private buildReview(opts: {
    input: PricingInput;
    subtotalUsd: number;
    taxPct: number;
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
      tax_percentage: opts.taxPct,
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
