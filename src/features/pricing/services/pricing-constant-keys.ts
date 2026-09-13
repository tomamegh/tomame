/**
 * Which `pricing_constants` rows the calculator cannot work without.
 *
 * Kept in a module of its own — no `server-only`, no database — because both
 * the server that refuses to price and the console that renders the warning
 * need the same list, and because "is this configuration complete?" deserves a
 * test that does not need a database to run.
 */

/** Every constant `PricingCalculator` reads. A row missing here is a real hole. */
export const REQUIRED_PRICING_CONSTANT_KEYS = [
  "freight_rate_per_lb",
  "handling_fee_usd",
  "minimum_tax_usd",
  "fx_buffer_pct",
  "tax_pct_usa",
  "tax_pct_uk",
  "tax_pct_china",
  "minimum_chargeable_weight_lbs",
  "default_value_fee_pct",
] as const;

export type RequiredPricingConstantKey = (typeof REQUIRED_PRICING_CONSTANT_KEYS)[number];

/**
 * Which required constants have no usable value.
 *
 * A row that exists but holds something that is not a finite number counts as
 * missing: it cannot price anything either, and calling it "present" would be
 * the same lie by a different route. Zero is present — a zero fee is a
 * decision somebody made.
 */
export function collectMissingConstants(values: Record<string, number | undefined>): string[] {
  return REQUIRED_PRICING_CONSTANT_KEYS.filter((key) => {
    const value = values[key];
    return typeof value !== "number" || !Number.isFinite(value);
  });
}
