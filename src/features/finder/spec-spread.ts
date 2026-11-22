import { z } from "zod";

/**
 * When one request's priced options sit far apart (an "LG 55 inch TV" that is
 * a $298 LED at Walmart and a $1,200 OLED at Amazon), the customer is told why
 * — the spec — before they wonder whether the dear one is a mistake (Kelvin,
 * 2026-11-22). Pure: the rule for when, and the model's output shape.
 */

/** Highest over lowest landed total at or above this needs a word on specs. */
export const SPEC_SPREAD_RATIO = 1.6;

export interface SpreadOption {
  title: string;
  store: string;
  totalGhs: number;
}

/** The options worth explaining, cheapest first; null when they are close enough. */
export function wideSpread(options: readonly SpreadOption[]): SpreadOption[] | null {
  const priced = options.filter((o) => Number.isFinite(o.totalGhs) && o.totalGhs > 0).sort((a, b) => a.totalGhs - b.totalGhs);
  if (priced.length < 2) return null;
  return priced[priced.length - 1]!.totalGhs / priced[0]!.totalGhs >= SPEC_SPREAD_RATIO ? priced : null;
}

export const SpecNoteOutputSchema = z.object({
  note: z.string().describe("Two sentences at most, for the customer. Empty string when the titles show no real difference."),
});

/** The model's note, trimmed and bounded; null when there is nothing to say. */
export function parseSpecNote(raw: { note?: string } | null | undefined): string | null {
  const note = raw?.note?.trim();
  if (!note) return null;
  return note.length > 400 ? `${note.slice(0, 397).trimEnd()}…` : note;
}
