import { APIError } from "@/lib/auth/api-helpers";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { TAX_PERCENTAGE, DEFAULT_FX_BUFFER_PCT, DEFAULT_FREIGHT_RATE_PER_LB, DEFAULT_HANDLING_FEE_USD } from "@/config/pricing";
import { getCategoryPricing } from "@/config/pricing-categories";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import type { FixedFreightItemRow } from "@/db/queries/fixed-freight-items";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PricingConstants {
  /** USD per pound for weight-based groups. The single freight knob for those groups. */
  freight_rate_per_lb: number;
  /** USD added once per order line for weight-based groups. */
  handling_fee_usd: number;
  minimum_tax_usd: number;
  fx_buffer_pct: number;
  tax_pct_usa: number;
  tax_pct_uk: number;
  tax_pct_china: number;
  /** Floor applied to any listed weight before a weight expression runs. */
  minimum_chargeable_weight_lbs: number;
  /** Service fee when a fixed-freight item matches but no pricing group does. */
  default_value_fee_pct: number;
}

export type PricingRegion = "usa" | "uk" | "china";

export interface PricingInput {
  /** Item price already in USD. Use this OR itemPrice + itemCurrency. */
  itemPriceUsd?: number;
  /** Item price in the store's currency; converted server-side via stored rates. */
  itemPrice?: number;
  itemCurrency?: string;
  quantity: number;
  category?: string | null;
  weightLbs?: number | null;
  /** Used to match pre-negotiated fixed-freight items (keywords). */
  productTitle?: string | null;
  /** Region for tax tier lookup. Defaults to "usa". */
  region?: PricingRegion;
}

export type PricingMethod = "flat_rate" | "weight_expression" | "fixed_freight" | "needs_review";

export interface PricingBreakdown {
  pricing_method: PricingMethod;
  pricing_group: string | null;
  /** Price as listed by the store, in item_currency. */
  item_price: number;
  item_currency: string;
  /** Listed price converted to USD (identity when item_currency is USD). */
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
  /** Human-readable "show the work" line: "36.2 lb × $5/lb + $3 handling", "fixed: iPhone 15 Pro", … */
  fee_calculation_note: string;
  /** Weight-based groups: the USD freight before conversion, and the knobs that produced it. */
  freight_usd?: number;
  freight_rate_per_lb?: number;
  handling_fee_usd?: number;
  weight_lbs?: number;
  weight_source?: "listed" | "default" | "minimum";
  fixed_freight_item?: string;
  review_reason?: string;
}

// ── Calculator ───────────────────────────────────────────────────────────────

export class PricingCalculator {
  private midMarketRate: number | null = null;
  private appliedRate: number | null = null;
  private crossRates = new Map<string, number>();
  private constants: PricingConstants | null = null;
  private categoryPricingMap: Map<string, PricingGroupRow> | null = null;
  private fixedFreightItems: FixedFreightItemRow[] | null = null;

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

  /** Inject DB-loaded fixed freight items. Without them, only group pricing applies. */
  setFixedFreightItems(items: FixedFreightItemRow[]): void {
    this.fixedFreightItems = items;
  }

  private get fxBufferPct(): number {
    return this.constants?.fx_buffer_pct ?? DEFAULT_FX_BUFFER_PCT;
  }

  private getTaxPercentage(region?: PricingRegion): number {
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

  /** Fetch and cache the USD→GHS rate. Throws 503 if unavailable. */
  async loadFxRate(): Promise<void> {
    const midMarket = await getGhsRate("USD");
    if (midMarket == null) {
      throw new APIError(503, "Exchange rate for USD/GHS not available. Please try again later.");
    }
    this.midMarketRate = midMarket;
    this.appliedRate = PricingCalculator.roundTo2(midMarket * (1 + this.fxBufferPct));
  }

  /**
   * Convert a store-currency price to USD via the stored X→GHS and USD→GHS
   * mid-market rates. Throws 503 when the store currency has no stored rate.
   */
  private async toUsd(price: number, currency: string): Promise<number> {
    const cur = currency.toUpperCase();
    if (cur === "USD") return price;
    let rate = this.crossRates.get(cur);
    if (rate == null) {
      const ghs = await getGhsRate(cur);
      if (ghs == null) {
        throw new APIError(503, `Exchange rate for ${cur}/GHS not available. Please try again later.`);
      }
      rate = ghs;
      this.crossRates.set(cur, rate);
    }
    return PricingCalculator.roundTo2((price * rate) / this.midMarketRate!);
  }

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

    const jsonPricing = getCategoryPricing(category);
    if (!jsonPricing) return null;
    const { group, pricing } = jsonPricing;
    return {
      group,
      flat_rate_ghs: typeof pricing.flat_rate_ghs === "number" ? pricing.flat_rate_ghs : null,
      flat_rate_expression: typeof pricing.flat_rate_ghs === "string" ? pricing.flat_rate_ghs : null,
      value_percentage: pricing.value_percentage,
      value_percentage_high: null,
      value_threshold_usd: null,
      default_weight_lbs: null,
      requires_weight: false,
      name: pricing.name,
    };
  }

  /** Longest keyword contained in the title wins. */
  private matchFixedFreight(title: string | null | undefined): FixedFreightItemRow | null {
    if (!title || !this.fixedFreightItems?.length) return null;
    const haystack = title.toLowerCase();
    let best: { item: FixedFreightItemRow; len: number } | null = null;
    for (const item of this.fixedFreightItems) {
      for (const kw of item.keywords) {
        const k = kw.toLowerCase().trim();
        if (k && haystack.includes(k) && (!best || k.length > best.len)) best = { item, len: k.length };
      }
    }
    return best?.item ?? null;
  }

  /** Calculate the full pricing breakdown for an order. */
  async calculate(input: PricingInput): Promise<PricingBreakdown> {
    if (this.appliedRate == null) await this.loadFxRate();

    const r2 = PricingCalculator.roundTo2;
    const fxRate = this.appliedRate!;
    const midRate = this.midMarketRate!;

    const { quantity, category, region } = input;
    const itemCurrency = (input.itemCurrency ?? "USD").toUpperCase();
    const itemPrice = input.itemPrice ?? input.itemPriceUsd;
    if (itemPrice == null || !(itemPrice > 0)) {
      throw new APIError(400, "An item price is required to calculate pricing.");
    }
    const itemPriceUsd = input.itemPriceUsd ?? (await this.toUsd(itemPrice, itemCurrency));

    const subtotalUsd = r2(itemPriceUsd * quantity);
    const taxPct = this.getTaxPercentage(region);
    const rawTax = r2(subtotalUsd * taxPct);
    const minimumTax = this.constants?.minimum_tax_usd ?? 0;
    const taxUsd = Math.max(rawTax, minimumTax);

    const base = {
      item_price: itemPrice,
      item_currency: itemCurrency,
      item_price_usd: itemPriceUsd,
      quantity,
      subtotal_usd: subtotalUsd,
      exchange_rate: fxRate,
      mid_market_rate: midRate,
      tax_percentage: taxPct,
      tax_usd: taxUsd,
    };

    const catPricing = this.lookupCategoryPricing(category);
    const fixed = this.matchFixedFreight(input.productTitle);

    const tieredFee = (basePct: number, highPct: number | null, threshold: number | null) =>
      threshold != null && highPct != null && subtotalUsd > threshold ? highPct : basePct;

    const finish = (
      method: Exclude<PricingMethod, "needs_review">,
      group: string | null,
      valueFeePct: number,
      flatRateGhs: number,
      note: string,
      extra: Partial<PricingBreakdown> = {},
    ): PricingBreakdown => {
      const valueFeeUsd = r2(subtotalUsd * valueFeePct);
      const usdComponentGhs = r2((subtotalUsd + taxUsd + valueFeeUsd) * fxRate);
      const totalGhs = r2(usdComponentGhs + flatRateGhs);
      return {
        pricing_method: method,
        pricing_group: group,
        ...base,
        value_fee_percentage: valueFeePct,
        value_fee_usd: valueFeeUsd,
        flat_rate_ghs: r2(flatRateGhs),
        total_ghs: totalGhs,
        total_pesewas: Math.round(totalGhs * 100),
        fee_calculation_note: note,
        ...extra,
      };
    };

    // 1. Pre-negotiated freight for a recognised product (iPhone 15 Pro, PS5, …).
    if (fixed) {
      const feePct = catPricing
        ? tieredFee(catPricing.value_percentage, catPricing.value_percentage_high, catPricing.value_threshold_usd)
        : this.constants?.default_value_fee_pct ?? 0.05;
      return finish(
        "fixed_freight",
        catPricing?.group ?? null,
        feePct,
        fixed.freight_rate_ghs,
        `fixed freight: ${fixed.product_name}`,
        { fixed_freight_item: fixed.product_name },
      );
    }

    // 2. No pricing group → admin decides.
    if (!catPricing) {
      logger.info("No pricing group for category, flagging for review", { category });
      return this.buildReview(base, null, 0, category
        ? `We don't have pricing set up for "${category}" products yet.`
        : "We couldn't determine the product category.");
    }

    const valueFeePct = tieredFee(catPricing.value_percentage, catPricing.value_percentage_high, catPricing.value_threshold_usd);

    // 3. Weight-based group: freight = chargeable weight × $/lb + handling, in
    //    USD, converted at the buffered rate. The group's `flat_rate_expression`
    //    only marks the group as weight-based; the rate and handling fee are the
    //    admin constants, so there are two knobs instead of one formula per group.
    if (catPricing.flat_rate_expression != null) {
      const minWeight = this.constants?.minimum_chargeable_weight_lbs ?? 0;
      let weight: number | null = null;
      let weightSource: PricingBreakdown["weight_source"];

      if (input.weightLbs != null && input.weightLbs > 0) {
        weight = input.weightLbs;
        weightSource = "listed";
        if (weight < minWeight) {
          weight = minWeight;
          weightSource = "minimum";
        }
      } else if (catPricing.default_weight_lbs != null) {
        weight = catPricing.default_weight_lbs;
        weightSource = "default";
      }

      if (weight == null) {
        return this.buildReview(base, catPricing.group, valueFeePct, catPricing.requires_weight
          ? `This product requires weight information for shipping. ${catPricing.name} orders cannot be processed without weight.`
          : `We couldn't determine the weight of this product, which is needed to calculate shipping for ${catPricing.name.toLowerCase()}.`);
      }

      const ratePerLb = this.constants?.freight_rate_per_lb ?? DEFAULT_FREIGHT_RATE_PER_LB;
      const handlingUsd = this.constants?.handling_fee_usd ?? DEFAULT_HANDLING_FEE_USD;
      // Weight is per item, so freight scales with quantity; handling is once per line.
      const chargeableLbs = r2(weight * quantity);
      const freightUsd = r2(chargeableLbs * ratePerLb + handlingUsd);
      const sourceNote = weightSource === "listed" ? "" : ` (${weightSource})`;
      const qtyNote = quantity > 1 ? ` × ${quantity}` : "";
      return finish(
        "weight_expression",
        catPricing.group,
        valueFeePct,
        freightUsd * fxRate,
        `${weight} lb${sourceNote}${qtyNote} × $${ratePerLb}/lb + $${handlingUsd} handling = $${freightUsd.toFixed(2)}`,
        { weight_lbs: weight, weight_source: weightSource, freight_usd: freightUsd, freight_rate_per_lb: ratePerLb, handling_fee_usd: handlingUsd },
      );
    }

    // 4. Flat-rate group.
    if (catPricing.flat_rate_ghs != null) {
      return finish(
        "flat_rate",
        catPricing.group,
        valueFeePct,
        catPricing.flat_rate_ghs,
        `flat rate: ${catPricing.name}`,
      );
    }

    return this.buildReview(base, catPricing.group, valueFeePct, `We couldn't calculate shipping for ${catPricing.name.toLowerCase()}.`);
  }

  private buildReview(
    base: Pick<PricingBreakdown, "item_price" | "item_currency" | "item_price_usd" | "quantity" | "subtotal_usd" | "exchange_rate" | "mid_market_rate" | "tax_percentage" | "tax_usd">,
    group: string | null,
    valueFeePct: number,
    reason: string,
  ): PricingBreakdown {
    return {
      pricing_method: "needs_review",
      pricing_group: group,
      ...base,
      value_fee_percentage: valueFeePct,
      value_fee_usd: PricingCalculator.roundTo2(base.subtotal_usd * valueFeePct),
      flat_rate_ghs: 0,
      total_ghs: 0,
      total_pesewas: 0,
      fee_calculation_note: "needs admin review",
      review_reason: reason,
    };
  }
}
