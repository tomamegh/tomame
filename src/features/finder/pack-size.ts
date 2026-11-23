/**
 * How many of the thing one listing holds, read from its title: "6 Month
 * Supply" is 6, "Pack of 3" is 3, a plain listing is 1. Pure.
 *
 * WHY (Kelvin, 2026-11-23): a 1-month Kirkland Minoxidil at GH₵340 was flagged
 * "much cheaper than other new listings" because the others were 6-month packs,
 * so the dearer 6-month pack was crowned best. Prices are compared per unit.
 *
 * Counts of pills, capsules, ounces or sheets are NOT packs: "100 Capsules" is
 * one bottle. Only supplies, packs, sets, bottles and boxes count.
 */

export interface PackSize {
  units: number;
  /** "month" for a supply, else "pack". */
  kind: "month" | "pack";
}

const MAX_UNITS = 24;

export function packSizeOf(title: string): PackSize {
  const t = title.replace(/\s+/g, " ");
  const month = t.match(/\b(\d{1,2})\s*-?\s*months?\s*(?:supply|pack)?\b/i);
  if (month && /supply|pack/i.test(t.slice(month.index ?? 0, (month.index ?? 0) + month[0].length + 12))) {
    return clamp(Number(month[1]), "month");
  }
  const pack = t.match(/\bpack\s+of\s+(\d{1,2})\b|\b(\d{1,2})\s*-?\s*(?:pack|pk|count pack)\b|\bset\s+of\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:bottles|boxes|cans|tubes)\b/i);
  if (pack) return clamp(Number(pack[1] ?? pack[2] ?? pack[3] ?? pack[4]), "pack");
  return { units: 1, kind: "pack" };
}

function clamp(n: number, kind: PackSize["kind"]): PackSize {
  return Number.isFinite(n) && n >= 1 && n <= MAX_UNITS ? { units: n, kind } : { units: 1, kind: "pack" };
}

/** Price per unit (per month of supply, per item in a pack). */
export function perUnit(price: number, title: string): number {
  return price / packSizeOf(title).units;
}

/** "a 6-month supply" / "a pack of 3" / null for a single item. */
export function packPhrase(title: string): string | null {
  const p = packSizeOf(title);
  if (p.units <= 1) return p.kind === "month" ? "a 1-month supply" : null;
  return p.kind === "month" ? `a ${p.units}-month supply` : `a pack of ${p.units}`;
}
