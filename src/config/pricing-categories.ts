import { TomameCategory } from "./categories/tomame_category";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CategoryPricing {
  /** Human-readable group name */
  name: string;
  /** Fixed freight in GHS (null = must calculate from weight) */
  flat_rate_ghs: number | null;
  /** Fee as a percentage of item value (e.g. 0.05 = 5%) */
  value_percentage: number;
  /** Whether weight is required to calculate freight */
  weight_required: boolean;
  /** USD per lb rate when weight-based (null if flat_rate) */
  per_weight_rate_usd: number | null;
}

// ── Pricing groups ───────────────────────────────────────────────────────────

export type PricingGroup =
  | "phones"
  | "phone_accessories"
  | "car_parts"
  | "gaming_consoles"
  | "sound_speakers";

export const CATEGORY_PRICING: Record<PricingGroup, CategoryPricing> = {
  phones: {
    name: "Phones",
    flat_rate_ghs: 1200,
    value_percentage: 0.05,
    weight_required: false,
    per_weight_rate_usd: null,
  },
  phone_accessories: {
    name: "Phone Accessories",
    flat_rate_ghs: 250,
    value_percentage: 0.04,
    weight_required: false,
    per_weight_rate_usd: null,
  },
  car_parts: {
    name: "Car Parts",
    flat_rate_ghs: null,
    value_percentage: 0.08,
    weight_required: true,
    per_weight_rate_usd: 6.5,
  },
  gaming_consoles: {
    name: "Gaming Consoles",
    flat_rate_ghs: 1500,
    value_percentage: 0.06,
    weight_required: false,
    per_weight_rate_usd: null,
  },
  sound_speakers: {
    name: "Sound & Speakers",
    flat_rate_ghs: null,
    value_percentage: 0.07,
    weight_required: true,
    per_weight_rate_usd: 6.5,
  },
};

// ── TomameCategory → PricingGroup mapping ────────────────────────────────────
// Multiple TomameCategories can map to one pricing group.
// Categories not in this map → needs_review.

export const CATEGORY_TO_PRICING_GROUP = new Map<TomameCategory, PricingGroup>([
  // Phones
  [TomameCategory.CELL_PHONES, "phones"],

  // Phone Accessories
  [TomameCategory.HEADPHONES, "phone_accessories"],
  [TomameCategory.WEARABLE_TECHNOLOGY, "phone_accessories"],

  // Car Parts
  [TomameCategory.AUTOMOTIVE, "car_parts"],
  [TomameCategory.CAR_CARE, "car_parts"],
  [TomameCategory.CAR_ELECTRONICS, "car_parts"],

  // Gaming Consoles
  [TomameCategory.VIDEO_GAMES, "gaming_consoles"],

  // Sound & Speakers
  [TomameCategory.SMART_HOME, "sound_speakers"],
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

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
