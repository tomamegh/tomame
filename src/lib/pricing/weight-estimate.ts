import { TomameCategory } from "@/config/categories/tomame_category";

/**
 * A deterministic shipping-weight estimate for products whose weight the store
 * did not list but whose title gives away their size. The category default
 * (15 lb for every television) priced a 65-inch TV at a quarter of its real
 * freight (2026-10-12); the screen diagonal is in nearly every TV title and
 * boxed weight tracks its square closely enough for a quote that the hub
 * confirms on the scale.
 *
 * Pure. Returns null when the title gives nothing to go on, so the caller
 * falls back to the category default as before.
 */
export interface WeightEstimate {
  lbs: number;
  /** Where the number came from, for the inspector's prompt and the admin. */
  basis: string;
}

/** Boxed weight in lb ≈ this × (diagonal in inches)². 55" → 48 lb, 65" → 68 lb, 85" → 116 lb. */
const TV_LBS_PER_SQUARE_INCH = 0.016;
const TV_DIAGONAL_RANGE = { min: 20, max: 110 };

/** `65"`, `65”`, `65-inch`, `65 inch`, `65in`, `65 in.`, `65''` → 65. The first plausible one wins. */
export function screenDiagonalInches(title: string | null | undefined): number | null {
  if (!title) return null;
  const re = /(\d{2,3}(?:\.\d)?)\s*(?:["”″]|''|-?\s*(?:inch(?:es)?|in)\b\.?)/gi;
  for (const m of title.matchAll(re)) {
    const d = parseFloat(m[1]!);
    if (Number.isFinite(d) && d >= TV_DIAGONAL_RANGE.min && d <= TV_DIAGONAL_RANGE.max) return d;
  }
  return null;
}

export function estimateWeightLbs(product: { title: string | null | undefined; category: string | null | undefined }): WeightEstimate | null {
  if (product.category !== TomameCategory.TV_VIDEO) return null;
  const d = screenDiagonalInches(product.title);
  if (d == null) return null;
  const lbs = Math.round(TV_LBS_PER_SQUARE_INCH * d * d * 10) / 10;
  return { lbs, basis: `${d}-inch screen` };
}
