import { formatPercent, formatUsd } from "@/features/marketing/format";

/**
 * Reading and writing a `pricing_constants` value.
 *
 * THE TRAP THIS CLOSES. Percentages are stored as fractions (`0.04`) and typed
 * as percentages (`4`). Every screen that has ever edited these has had to
 * remember to divide, and a single missed division would multiply the FX buffer
 * by a hundred and quietly overcharge every customer. So the conversion lives
 * in one pair of functions that are inverses of each other, and they are
 * tested as a round trip.
 *
 * The unit strings are the ones migration 027 and 035 seeded: `%`, `$`, `$/lb`,
 * `lb`. An unrecognised unit is printed as a bare number rather than guessed at.
 */

/** Stored value → what the admin reads. */
export function formatConstant(value: number, unit: string): string {
  switch (unit) {
    case "%":
      return formatPercent(value);
    case "$":
      return formatUsd(value);
    case "$/lb":
      return `${formatUsd(value)}/lb`;
    case "lb":
      return `${value} lb`;
    default:
      return String(value);
  }
}

/** Stored value → what goes in the input box. */
export function toInputValue(value: number, unit: string): string {
  return unit === "%" ? String(roundish(value * 100)) : String(value);
}

/**
 * What is in the input box → the value to store. Returns null for anything that
 * is not a number, so the caller refuses to save rather than writing a zero —
 * a fee silently reset to 0% is the worst outcome available here.
 */
export function fromInputValue(input: string, unit: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return unit === "%" ? roundish(parsed / 100) : parsed;
}

/** The suffix printed inside the input, so the admin can see which scale they are on. */
export function inputSuffix(unit: string): string | null {
  switch (unit) {
    case "%":
      return "%";
    case "$/lb":
      return "/lb";
    case "$":
      return "$";
    case "lb":
      return "lb";
    default:
      return null;
  }
}

/**
 * Floating-point tidy-up. `4 / 100` is 0.04, but `7.3 / 100` is
 * 0.07300000000000001, which would be written to the column verbatim and then
 * read back as a value the admin never typed.
 */
function roundish(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}
