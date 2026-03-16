import { CATEGORY_DEFAULT_WEIGHTS } from "@/config/pricing";

/**
 * Parse a weight string into lbs.
 * Handles formats like "5 lbs", "2.3 kg", "500g", "0.5 pounds", "8 oz".
 */
export function parseWeight(raw: string | null | undefined): number | null {
  if (!raw) return null;

  const cleaned = raw.trim().toLowerCase();

  // Try lbs / pounds
  const lbMatch = cleaned.match(/([\d.]+)\s*(?:lbs?|pounds?)/);
  if (lbMatch?.[1]) return parseFloat(lbMatch[1]) || null;

  // Try kg / kilograms
  const kgMatch = cleaned.match(/([\d.]+)\s*(?:kg|kilograms?)/);
  if (kgMatch?.[1]) {
    const kg = parseFloat(kgMatch[1]);
    return kg ? roundTo2(kg * 2.20462) : null;
  }

  // Try grams
  const gMatch = cleaned.match(/([\d.]+)\s*(?:g|grams?)/);
  if (gMatch?.[1]) {
    const g = parseFloat(gMatch[1]);
    return g ? roundTo2(g * 0.00220462) : null;
  }

  // Try ounces
  const ozMatch = cleaned.match(/([\d.]+)\s*(?:oz|ounces?)/);
  if (ozMatch?.[1]) {
    const oz = parseFloat(ozMatch[1]);
    return oz ? roundTo2(oz / 16) : null;
  }

  // Try bare number (assume lbs)
  const bareNum = parseFloat(cleaned);
  return bareNum > 0 ? bareNum : null;
}

/**
 * Parse a dimensions string into { length, width, height } in inches.
 * Handles formats like "12 x 10 x 8 inches", "12x10x8", "12 × 10 × 8 in".
 */
export function parseDimensions(
  raw: string | null | undefined,
): { length: number; width: number; height: number } | null {
  if (!raw) return null;

  const cleaned = raw.trim().toLowerCase();

  // Match patterns like "12 x 10 x 8", "12×10×8", "12 X 10 X 8"
  const match = cleaned.match(
    /([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)/,
  );
  if (!match?.[1] || !match[2] || !match[3]) return null;

  const length = parseFloat(match[1]);
  const width = parseFloat(match[2]);
  const height = parseFloat(match[3]);

  if (!length || !width || !height) return null;

  // If dimensions are in cm, convert to inches
  if (cleaned.includes("cm") || cleaned.includes("centimeter")) {
    return {
      length: roundTo2(length / 2.54),
      width: roundTo2(width / 2.54),
      height: roundTo2(height / 2.54),
    };
  }

  return { length, width, height };
}

/**
 * Get category default weight in lbs from category string.
 * Returns null if no default is found.
 */
export function getCategoryDefaultWeight(
  category: string | null | undefined,
): number | null {
  if (!category) return null;
  return CATEGORY_DEFAULT_WEIGHTS[category] ?? null;
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
