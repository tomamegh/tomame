/**
 * Display formatting for the marketing surfaces.
 *
 * House rules from the redesign: GH₵ always leads and $ is the echo in
 * parentheses; percentages print without trailing zeros ("5%", not "5.0%");
 * money keeps two decimals unless it is a round whole number used as a chip.
 */

const GHS_SYMBOL = "GH₵";

const ghsFormatter = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeFormatter = new Intl.NumberFormat("en-GH", {
  maximumFractionDigits: 0,
});

/** 5041.16 → "GH₵5,041.16" */
export function formatGhs(amount: number): string {
  return `${GHS_SYMBOL}${ghsFormatter.format(amount)}`;
}

/** 40 → "GH₵40"; 40.5 → "GH₵40.50". Used for round display figures. */
export function formatGhsCompact(amount: number): string {
  return Number.isInteger(amount)
    ? `${GHS_SYMBOL}${wholeFormatter.format(amount)}`
    : formatGhs(amount);
}

/** 349.36 → "$349.36" */
export function formatUsd(amount: number): string {
  return `$${ghsFormatter.format(amount)}`;
}

/** 298 → "$298"; 1200 → "$1,200". Used for the price chips. */
export function formatUsdCompact(amount: number): string {
  return Number.isInteger(amount)
    ? `$${wholeFormatter.format(amount)}`
    : formatUsd(amount);
}

/** 0.05 → "5%"; 0.075 → "7.5%". Accepts a fraction, not a percentage. */
export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** The FX buffer reads as an addition on the mid-market rate: "+4%". */
export function formatPercentDelta(fraction: number): string {
  return `+${formatPercent(fraction)}`;
}

export function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Bar widths the design draws: clamped to 0–100 and rounded to a whole. */
export function toBarPct(part: number, whole: number): number {
  if (!(whole > 0) || !Number.isFinite(part)) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}
