/** Service fee tiers — applied as percentage of item price (Method 2 only) */
export const SERVICE_FEE_TIERS = [
  { maxUsd: 100, percentage: 0.18, minimumUsd: 12 },
  { maxUsd: 300, percentage: 0.15, minimumUsd: 0 },
  { maxUsd: 700, percentage: 0.12, minimumUsd: 0 },
  { maxUsd: 1500, percentage: 0.10, minimumUsd: 0 },
  { maxUsd: Infinity, percentage: 0.08, minimumUsd: 0 },
] as const;

/** Category default weights (lbs) — last-resort fallback when weight is unknown */
export const CATEGORY_DEFAULT_WEIGHTS: Record<string, number> = {
  // TomameCategory enum values → default weight in lbs
  "Cell Phones & Accessories": 0.5,
  Electronics: 0.5,
  "Wearable Technology": 0.4,
  Headphones: 0.5,
  Computers: 4.5,
  "Video Games": 8.0,
  "Smart Home": 2.0,
  // Generic fallback categories from the PDF
  smartphones: 0.5,
  tablets_ipads: 1.5,
  laptops: 4.5,
  smartwatches: 0.4,
  headphones_earbuds: 0.5,
  speakers_small: 2.0,
  speakers_large: 4.0,
  gaming_consoles: 8.0,
  gaming_accessories: 1.0,
  general_accessories: 0.5,
};

/** Fallback FX rate when exchange_rates table has no data */
export const FALLBACK_FX_RATE = 14.5;

/** Default FX buffer percentage (4%) */
export const DEFAULT_FX_BUFFER_PCT = 0.04;

/** Default international freight rate per lb (USD) */
export const DEFAULT_FREIGHT_RATE_PER_LB = 6.5;

/** Default flat handling fee per order (USD) */
export const DEFAULT_HANDLING_FEE_USD = 15.0;

/** Default volumetric weight divisor (for dimensions in inches) */
export const DEFAULT_VOLUMETRIC_DIVISOR = 139;
