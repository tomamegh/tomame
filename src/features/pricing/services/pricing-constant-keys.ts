/**
 * Which `pricing_constants` rows the calculator cannot work without.
 *
 * The list itself now lives next to the calculator that reads it
 * (`src/lib/pricing/required-constants.ts`) so the engine, the settings screen
 * and the pricing console cannot drift apart. This module stays as the feature
 * layer's door onto it.
 */
export {
  REQUIRED_PRICING_CONSTANT_KEYS,
  collectMissingConstants,
  type RequiredPricingConstantKey,
} from "@/lib/pricing/required-constants";
