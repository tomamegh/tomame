import { PricingCalculator } from "@/lib/pricing";
import type { PricingInput, PricingBreakdown, PricingConstants } from "@/lib/pricing";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { logger } from "@/lib/logger";

export type { PricingInput as CalculatePricingInput };

export async function calculatePricing(
  input: PricingInput,
): Promise<PricingBreakdown> {
  const calculator = new PricingCalculator();

  try {
    const map = await getPricingConstantsMap();
    const constants: PricingConstants = {
      freight_rate_per_lb: map.freight_rate_per_lb ?? 5,
      handling_fee_usd: map.handling_fee_usd ?? 3,
      minimum_tax_usd: map.minimum_tax_usd ?? 2,
      fx_buffer_pct: map.fx_buffer_pct ?? 0.04,
      tax_pct_usa: map.tax_pct_usa ?? 0.10,
      tax_pct_uk: map.tax_pct_uk ?? 0.10,
      tax_pct_china: map.tax_pct_china ?? 0.08,
    };
    calculator.setConstants(constants);
  } catch (err) {
    logger.warn("Failed to load pricing constants from DB, using defaults", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return calculator.calculate(input);
}
