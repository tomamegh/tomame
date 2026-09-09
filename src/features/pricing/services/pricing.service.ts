import { PricingCalculator } from "@/lib/pricing";
import type { PricingInput, PricingBreakdown, PricingConstants } from "@/lib/pricing";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { getCategoryPricingMap } from "@/db/queries/pricing-groups";
import { getActiveFixedFreightItems } from "@/db/queries/fixed-freight-items";
import { logger } from "@/lib/logger";

export type { PricingInput as CalculatePricingInput };

/** Build a calculator with every admin-controlled input loaded from the DB. */
export async function loadPricingCalculator(): Promise<PricingCalculator> {
  const calculator = new PricingCalculator();

  const [constantsRes, categoryRes, fixedRes] = await Promise.allSettled([
    getPricingConstantsMap(),
    getCategoryPricingMap(),
    getActiveFixedFreightItems(),
  ]);

  if (constantsRes.status === "fulfilled") {
    const map = constantsRes.value;
    const constants: PricingConstants = {
      freight_rate_per_lb: map.freight_rate_per_lb ?? 5,
      handling_fee_usd: map.handling_fee_usd ?? 3,
      minimum_tax_usd: map.minimum_tax_usd ?? 2,
      fx_buffer_pct: map.fx_buffer_pct ?? 0.04,
      tax_pct_usa: map.tax_pct_usa ?? 0.1,
      tax_pct_uk: map.tax_pct_uk ?? 0.1,
      tax_pct_china: map.tax_pct_china ?? 0.08,
      minimum_chargeable_weight_lbs: map.minimum_chargeable_weight_lbs ?? 1,
      default_value_fee_pct: map.default_value_fee_pct ?? 0.05,
    };
    calculator.setConstants(constants);
  } else {
    logger.warn("Failed to load pricing constants from DB, using defaults", { error: String(constantsRes.reason) });
  }

  if (categoryRes.status === "fulfilled") {
    calculator.setCategoryPricing(categoryRes.value);
  } else {
    logger.warn("Failed to load category pricing from DB, falling back to JSON config", { error: String(categoryRes.reason) });
  }

  if (fixedRes.status === "fulfilled") {
    calculator.setFixedFreightItems(fixedRes.value);
  } else {
    logger.warn("Failed to load fixed freight items from DB", { error: String(fixedRes.reason) });
  }

  return calculator;
}

export async function calculatePricing(input: PricingInput): Promise<PricingBreakdown> {
  const calculator = await loadPricingCalculator();
  return calculator.calculate(input);
}
