/**
 * Unit-aware weight parsing for extraction. Weight feeds freight pricing, so a
 * number without a unit is never guessed to be pounds: "4" stays text and
 * `weight_lbs` stays null unless the caller knows the unit from elsewhere (a
 * "Weight Unit" spec, or a key like "Item Weight (lbs)").
 */

export type WeightUnit = "lb" | "oz" | "kg" | "g";

const INVISIBLE = /[\u200E\u200F\u200B\u202A-\u202E\u2066-\u2069\u00AD\uFEFF]/g;

/** Strip the LTR marks / zero-width chars Amazon embeds in spec values, then trim. */
export function cleanSpecText(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** Same as cleanSpecText, but null-safe and empty → null. */
export function cleanSpecValue(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  return cleanSpecText(raw) || null;
}

const TO_LBS: Record<WeightUnit, number> = { lb: 1, oz: 1 / 16, kg: 2.20462, g: 0.00220462 };

/** "lbs" / "Pounds" / "KGM" / "gram" → a unit, or null. */
export function unitOf(raw: string | null | undefined): WeightUnit | null {
  if (!raw) return null;
  const t = cleanSpecText(raw).toLowerCase().replace(/\.$/, "");
  if (/^(lbs?|pounds?|lbr)$/.test(t)) return "lb";
  if (/^(oz|ounces?|onz)$/.test(t)) return "oz";
  if (/^(kgs?|kilograms?|kilos?|kgm)$/.test(t)) return "kg";
  if (/^(g|gr|grams?|grammes?|grm)$/.test(t)) return "g";
  return null;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?|\.\d+)`;
const UNIT = String.raw`(lbs?|pounds?|oz|ounces?|kgs?|kilograms?|kilos?|grams?|grammes?|gr|g)`;
const QTY = new RegExp(String.raw`${NUM}\s*${UNIT}(?![a-z])`, "gi");

function toNumber(s: string): number {
  // "1,2" is a decimal comma; "1,200" is a thousands separator.
  const n = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  return parseFloat(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse a weight string into pounds.
 *
 * - Units: lb/lbs/pound(s), oz/ounce(s), g/gram(s), kg/kilogram(s); case-insensitive.
 * - Compound "2 lbs 4 oz" sums adjacent pound + ounce parts (2.25).
 * - Text around the quantity is ignored ("13 x 8 x 1 inches; 1.49 pounds" → 1.49).
 * - A bare number ("4") returns null unless `defaultUnit` is given.
 * - Anything unparseable, zero or negative → null. Result rounded to 2 dp,
 *   but never rounded down to 0 (a 0.18 oz item is 0.01, not "no weight").
 */
export function parseWeightLbs(raw: string | null | undefined, defaultUnit: WeightUnit | null = null): number | null {
  if (!raw) return null;
  const text = cleanSpecText(raw);
  const matches = [...text.matchAll(QTY)];

  let lbs: number | null = null;
  if (matches.length > 0) {
    const first = matches[0]!;
    const unit = unitOf(first[2]);
    if (unit) {
      lbs = toNumber(first[1]!) * TO_LBS[unit];
      // "2 lbs 4 oz" / "2 lb, 4 oz" — only when the ounce part directly follows.
      const next = matches[1];
      if (unit === "lb" && next && unitOf(next[2]) === "oz") {
        const between = text.slice(first.index! + first[0].length, next.index!);
        if (/^[\s,&+and]*$/i.test(between)) lbs += toNumber(next[1]!) / 16;
      }
    }
  } else if (defaultUnit) {
    const bare = text.match(/^\s*(\d+(?:[.,]\d+)?|\.\d+)\s*$/);
    if (bare?.[1]) lbs = toNumber(bare[1]) * TO_LBS[defaultUnit];
  }

  if (lbs == null || !Number.isFinite(lbs) || lbs <= 0) return null;
  return Math.max(round2(lbs), 0.01);
}

/** The weight part of Amazon's "13 x 8 x 1 inches; 1.49 pounds", else null. */
export function weightInDimensions(dimensions: string | null | undefined): string | null {
  if (!dimensions) return null;
  const parts = cleanSpecText(dimensions).split(";").map((p) => p.trim());
  for (const p of parts.slice(1)) if (parseWeightLbs(p) != null) return p;
  return null;
}

/** "Item Weight (lbs)" → "lb". */
function unitInKey(key: string): WeightUnit | null {
  const m = key.match(/\(([^)]+)\)|\bin\s+([a-z]+)\s*$/i);
  return unitOf(m?.[1] ?? m?.[2]);
}

function isUnitKey(key: string): boolean {
  return /\bunits?\b/i.test(key);
}

/**
 * Weight from a spec table. Prefers item/product weight over shipping/package
 * weight, reads a sibling "Weight Unit" / "Unit of Weight" spec or a unit in the
 * key for unitless values, and falls back to a "; 1.49 pounds" tail on a
 * dimensions spec. `text` is the raw value (cleaned); `lbs` may be null.
 */
export function weightFromSpecs(specs: Record<string, string>): { text: string | null; lbs: number | null } {
  const entries = Object.entries(specs).map(([k, v]) => [k, cleanSpecValue(v)] as const);
  const unitSpec = entries.find(([k, v]) => v && isUnitKey(k) && /weight/i.test(k))?.[1] ?? null;
  const siblingUnit = unitOf(unitSpec);

  const weightKeys = entries.filter(([k, v]) => v && /\bweight\b/i.test(k) && !isUnitKey(k));
  const rank = (k: string) => (/shipping|package|packaging|gross/i.test(k) ? 1 : 0);
  weightKeys.sort((a, b) => rank(a[0]) - rank(b[0]));

  for (const [k, v] of weightKeys) {
    const lbs = parseWeightLbs(v, unitInKey(k) ?? siblingUnit);
    if (lbs != null) return { text: v, lbs };
  }
  for (const [k, v] of entries) {
    if (!v || !/dimension/i.test(k)) continue;
    const w = weightInDimensions(v);
    if (w) return { text: w, lbs: parseWeightLbs(w) };
  }
  return { text: weightKeys[0]?.[1] ?? null, lbs: null };
}

/**
 * Dimensions from a spec table. An explicit "Dimensions" / "Item Dimensions"
 * spec wins; otherwise separate Length / Width / Height specs are combined into
 * "18 x 14 x 3" (plus a unit when one is stated). Never a single number.
 */
export function dimensionsFromSpecs(specs: Record<string, string>): string | null {
  const entries = Object.entries(specs).map(([k, v]) => [k, cleanSpecValue(v)] as const);
  const explicit = entries.find(([k, v]) => v && /dimensions?\b/i.test(k) && !isUnitKey(k))?.[1];
  if (explicit) return explicit;

  const axis = (re: RegExp) => entries.find(([k, v]) => v && re.test(k) && !isUnitKey(k))?.[1] ?? null;
  // Exact keys only: "Sleeve Length" or "Heel Height" are not the item's size.
  const l = axis(/^(item |product )?(length|depth)$/i);
  const w = axis(/^(item |product )?width$/i);
  const h = axis(/^(item |product )?height$/i);
  if (!l || !w || !h) return null;

  const split = (v: string) => v.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  const parts = [l, w, h].map(split);
  if (parts.some((p) => !p)) return `${l} x ${w} x ${h}`;
  const unitSpec = entries.find(([k, v]) => v && isUnitKey(k) && /length|dimension|size/i.test(k))?.[1] ?? null;
  const unit = parts.map((p) => p![2]!.trim()).find(Boolean) || unitSpec || "";
  return `${parts.map((p) => p![1]).join(" x ")}${unit ? ` ${unit}` : ""}`;
}
