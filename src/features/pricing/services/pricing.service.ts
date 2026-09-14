import { PricingCalculator, collectMissingConstants } from "@/lib/pricing";
import type { PricingInput, PricingBreakdown, PricingConstants, FxOverride } from "@/lib/pricing";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { getCategoryPricingMap } from "@/db/queries/pricing-groups";
import { getActiveFixedFreightItems } from "@/db/queries/fixed-freight-items";
import { logger } from "@/lib/logger";

export type { PricingInput as CalculatePricingInput };

/**
 * Build a calculator with every admin-controlled input loaded from the DB.
 *
 * NO SUBSTITUTION. What the table holds is what the calculator gets. A missing
 * row used to be filled with a literal here (`map.freight_rate_per_lb ?? 5`),
 * which meant a half-configured environment quoted a real customer a real
 * total built from a number nobody had chosen. Now the gap travels: the
 * calculator that comes back returns `needs_review` instead of a price, and
 * the keys that are absent are named in the log, which is the one place a
 * constant name is useful to anybody.
 */
export async function loadPricingCalculator(): Promise<PricingCalculator> {
  const calculator = new PricingCalculator();

  const [constantsRes, categoryRes, fixedRes] = await Promise.allSettled([
    getPricingConstantsMap(),
    getCategoryPricingMap(),
    getActiveFixedFreightItems(),
  ]);

  if (constantsRes.status === "fulfilled") {
    const map = constantsRes.value;
    const missing = collectMissingConstants(map);
    if (missing.length > 0) {
      logger.warn("Pricing constants incomplete — quotes will be flagged for review, not priced", {
        missing,
        present: Object.keys(map).sort(),
      });
    }
    // Pass the rows through as they are; the calculator decides whether that
    // set can price, and refuses as a whole rather than per-field.
    calculator.setConstants(map as Partial<PricingConstants>);
  } else {
    logger.warn("Failed to load pricing constants from DB — quotes will be flagged for review, not priced", {
      error: String(constantsRes.reason),
    });
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

/**
 * Price one line with every admin knob loaded. `fx` is `null` for the live
 * rate, or a quote lock's frozen pair — see `PricingCalculator.calculate`.
 */
export async function calculatePricing(input: PricingInput, fx: FxOverride | null): Promise<PricingBreakdown> {
  const calculator = await loadPricingCalculator();
  return calculator.calculate(input, fx);
}
