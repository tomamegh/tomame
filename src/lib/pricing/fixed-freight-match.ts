import { TomameCategory } from "@/config/categories/tomame_category";
import {
  FIXED_FREIGHT_ACCESSORY_CONNECTORS,
  FIXED_FREIGHT_ACCESSORY_NOUNS,
  FIXED_FREIGHT_CATEGORY_MAP,
} from "@/config/fixed-freight-categories";
import type { FixedFreightItemRow } from "@/db/queries/fixed-freight-items";

export interface FixedFreightMatch {
  item: FixedFreightItemRow;
  /** The keyword that hit, lower-cased. */
  keyword: string;
}

const TOMAME_CATEGORIES = new Set<string>(Object.values(TomameCategory));

const isLetter = (ch: string) => /[a-z]/.test(ch);
const isDigit = (ch: string) => /[0-9]/.test(ch);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A keyword as a whole-word regex. Words are runs of letters or runs of digits,
 * so a boundary is anything that changes class: "omen" misses "Women", "rog"
 * misses "progressive", but "samsung galaxy a" still hits "Galaxy A15" and
 * "ps5" hits "PS5-Pro". A letter-final keyword also takes a plural ("laptops",
 * "headlights"). Spaces and hyphens inside a keyword are interchangeable.
 */
export function keywordPattern(keyword: string): RegExp | null {
  const k = keyword.toLowerCase().trim().replace(/\s+/g, " ");
  if (!k) return null;
  const body = k.split(/[\s-]+/).map(escapeRegex).join("[\\s-]+");
  const first = k.charAt(0);
  const last = k.charAt(k.length - 1);
  const lead = isLetter(first) ? "(?<![a-z])" : isDigit(first) ? "(?<![0-9])" : "";
  const trail = isLetter(last) ? "(?:e?s)?(?![a-z])" : isDigit(last) ? "(?![0-9])" : "";
  return new RegExp(`${lead}${body}${trail}`, "g");
}

/**
 * Whether a fixed item's shelf may price a product of this Tomame category.
 * An unknown product category (null, `Other`, or not a Tomame value) and a
 * fixed shelf missing from the map are both ungated: keyword alone decides.
 */
export function fixedFreightCategoryAllows(fixedCategory: string, productCategory: string | null | undefined): boolean {
  if (!productCategory || productCategory === TomameCategory.OTHER || !TOMAME_CATEGORIES.has(productCategory)) return true;
  const allowed = FIXED_FREIGHT_CATEGORY_MAP[fixedCategory.trim().toUpperCase()];
  if (!allowed) return true;
  return allowed.has(productCategory as TomameCategory);
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const isNoun = (word: string, noun: string) => word === noun || word === `${noun}s` || word === `${noun}es`;

/**
 * True when the title reads as an accessory for the product the keyword names:
 * an accessory noun in the two words after the keyword ("laptop stand", "watch
 * band", "iPhone 15 Pro Max case"), or an accessory noun followed by a connector
 * before it ("Case compatible with iPhone 15", "Controller for PS5"). Nouns the
 * item's own name or keywords use are exempt, so "PS5 Controller" still prices
 * as a controller.
 */
export function isAccessoryFor(item: FixedFreightItemRow, title: string, start: number, end: number): boolean {
  const own = new Set(words(`${item.product_name} ${item.keywords.join(" ")}`));
  const nouns = FIXED_FREIGHT_ACCESSORY_NOUNS.filter((n) => ![...own].some((w) => isNoun(w, n)));
  const hasNoun = (w: string) => nouns.some((n) => isNoun(w, n));

  if (words(title.slice(end)).slice(0, 2).some(hasNoun)) return true;

  const before = words(title.slice(0, start));
  const nounAt = before.findIndex(hasNoun);
  return nounAt >= 0 && before.slice(nounAt + 1).some((w) => FIXED_FREIGHT_ACCESSORY_CONNECTORS.includes(w));
}

/**
 * The fixed-freight item a product title names, or null. Longest keyword wins
 * across every item the category gate lets through; a tie keeps the earlier
 * item (the list arrives in `sort_order`). A keyword occurrence that reads as
 * an accessory is skipped, but a later clean occurrence in the same title still
 * counts.
 */
export function matchFixedFreightItem(
  items: readonly FixedFreightItemRow[],
  title: string | null | undefined,
  category: string | null | undefined,
): FixedFreightMatch | null {
  if (!title || !items.length) return null;
  const haystack = title.toLowerCase();
  let best: FixedFreightMatch | null = null;
  for (const item of items) {
    if (!fixedFreightCategoryAllows(item.category, category)) continue;
    for (const kw of item.keywords) {
      const re = keywordPattern(kw);
      if (!re) continue;
      const k = kw.toLowerCase().trim();
      if (best && k.length <= best.keyword.length) continue;
      for (const m of haystack.matchAll(re)) {
        if (!isAccessoryFor(item, haystack, m.index, m.index + m[0].length)) {
          best = { item, keyword: k };
          break;
        }
      }
    }
  }
  return best;
}
