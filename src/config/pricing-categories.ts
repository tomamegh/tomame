import { TomameCategory } from "./categories/tomame_category";
import pricingData from "./pricing-categories.json";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CategoryPricing {
  name: string;
  /** Fixed GHS value OR an expression string using `w` (weight in lbs) */
  flat_rate_ghs: number | string;
  /** Fee as a percentage of item value (e.g. 0.05 = 5%) */
  value_percentage: number;
}

// ── Pricing groups ───────────────────────────────────────────────────────────

export type PricingGroup = keyof typeof pricingData;

export const CATEGORY_PRICING = pricingData as Record<PricingGroup, CategoryPricing>;

// ── TomameCategory → PricingGroup mapping ────────────────────────────────────

export const CATEGORY_TO_PRICING_GROUP = new Map<TomameCategory, PricingGroup>([
  [TomameCategory.CELL_PHONES, "phones"],
  [TomameCategory.HEADPHONES, "phone_accessories"],
  [TomameCategory.WEARABLE_TECHNOLOGY, "phone_accessories"],
  [TomameCategory.AUTOMOTIVE, "car_parts"],
  [TomameCategory.CAR_CARE, "car_parts"],
  [TomameCategory.CAR_ELECTRONICS, "car_parts"],
  [TomameCategory.VIDEO_GAMES, "gaming_consoles"],
  [TomameCategory.SMART_HOME, "sound_speakers"],
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if flat_rate_ghs is an expression requiring weight */
export function isWeightExpression(flatRate: number | string): flatRate is string {
  return typeof flatRate === "string";
}

/**
 * Evaluate a flat_rate expression, substituting `w` with weight in lbs.
 * Only allows digits, decimals, whitespace, w, and basic arithmetic.
 */
export function evaluateFlatRate(expr: string, w: number): number {
  if (!/^[\d\s.w+\-*/()]+$/.test(expr)) {
    throw new Error(`Invalid flat rate expression: "${expr}"`);
  }
  const resolved = expr.replace(/w/g, String(w));
  return new Function(`return (${resolved})`)() as number;
}

/**
 * Resolve flat_rate_ghs to a number. If it's an expression, evaluate with weight.
 * Returns null if expression requires weight but none provided.
 */
export function resolveFlatRate(
  flatRate: number | string,
  weightLbs?: number | null,
): number | null {
  if (typeof flatRate === "number") return flatRate;
  if (weightLbs == null) return null;
  return evaluateFlatRate(flatRate, weightLbs);
}

/**
 * Look up the pricing config for a TomameCategory.
 * Returns null if the category has no pricing group (→ needs_review).
 */
export function getCategoryPricing(
  category: TomameCategory | string | null | undefined,
): { group: PricingGroup; pricing: CategoryPricing } | null {
  if (!category) return null;
  const group = CATEGORY_TO_PRICING_GROUP.get(category as TomameCategory);
  if (!group) return null;
  return { group, pricing: CATEGORY_PRICING[group] };
}
