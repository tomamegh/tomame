import { TomameCategory } from "@/config/categories/tomame_category";
import type { ScrapedProduct } from "./scrapers/types";
import { variantChoicesOf } from "./variant-choices";

/**
 * Which size, colour or other option the customer is buying. The buyer cannot
 * guess it from a link: most stores (eBay, Amazon, Walmart, SKIMS) do not say
 * which size a pasted link means, so whenever an item comes in options the
 * customer answers before paying, and the answer travels to the order
 * (`orders.chosen_options`) where staff buy from it.
 */
export interface ItemOptionQuestion {
  /** "Size", "Colour", or the store's own option name. */
  name: string;
  /** The store's values to pick from; empty = the customer types it. */
  values: string[];
  /** Set when the link itself fixes the answer (a Shopify variant, an Amazon ASIN). */
  pinned: string | null;
}

export type ChosenOptions = Record<string, string>;

/** Items that come in sizes even when the store did not list them. */
const SIZED_CATEGORIES: ReadonlySet<string> = new Set([
  TomameCategory.CLOTHING_WOMEN,
  TomameCategory.CLOTHING_MEN,
  TomameCategory.CLOTHING_KIDS,
  TomameCategory.SHOES_WOMEN,
  TomameCategory.SHOES_MEN,
  TomameCategory.SHOES_KIDS,
  TomameCategory.KIDS_FASHION,
]);

/** Stores whose product link is one exact item, so a size the page reports is the one bought. */
const EXACT_ITEM_PLATFORMS: ReadonlySet<string> = new Set(["amazon", "ebay", "walmart", "target", "bestbuy"]);

/** Option lists that are not the customer's choice. */
const NOT_A_CHOICE = /^(condition|title|default)$/i;

export const MAX_OPTION_VALUE_LENGTH = 60;
const MAX_OPTIONS = 6;

function displayName(key: string): string {
  const k = key.trim();
  if (/^colou?r$/i.test(k)) return "Colour";
  if (/^size$/i.test(k)) return "Size";
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** The listing's own value for `name` (specifications, or `size`), or null. */
function listedValue(product: ScrapedProduct, name: string): string | null {
  for (const [k, v] of Object.entries(product.specifications ?? {})) {
    if (displayName(k) === name && typeof v === "string" && v.trim()) return v.trim();
  }
  if (name === "Size" && product.size?.trim()) return product.size.trim();
  return null;
}

/** What the customer must tell us about this item before we can buy it. Empty when nothing. */
export function itemOptionQuestions(input: { product: ScrapedProduct | null | undefined; platform?: string | null }): ItemOptionQuestion[] {
  const product = input.product;
  if (!product) return [];

  // The store published every variant and the link picks one: nothing to ask.
  const choices = variantChoicesOf(product);
  if (choices) {
    const selected = choices.choices.find((c) => c.id === choices.selectedId) ?? null;
    return choices.options.map((o) => ({ name: displayName(o.name), values: o.values, pinned: selected?.options[o.name] ?? null }));
  }

  const exact = EXACT_ITEM_PLATFORMS.has(input.platform ?? "");
  const questions: ItemOptionQuestion[] = [];
  for (const [key, list] of Object.entries(product.variants ?? {})) {
    if (NOT_A_CHOICE.test(key) || !Array.isArray(list)) continue;
    const name = displayName(key);
    if (questions.some((q) => q.name === name)) continue;
    const values = [...new Set(list.map((v) => v.trim()).filter(Boolean))];
    if (values.length < 2) continue;
    const listed = listedValue(product, name);
    questions.push({ name, values, pinned: exact && listed ? listed : null });
  }

  if (!questions.some((q) => q.name === "Size") && product.category && SIZED_CATEGORIES.has(product.category)) {
    const listed = listedValue(product, "Size");
    questions.push({ name: "Size", values: [], pinned: exact && listed ? listed : null });
  }
  return questions.slice(0, MAX_OPTIONS);
}

/**
 * The customer's answers checked against the questions: a listed value must be
 * one of the store's (matched without case), a typed one is trimmed and capped,
 * a pinned one always wins, and anything not asked is dropped.
 */
export function resolveChosenOptions(
  questions: readonly ItemOptionQuestion[],
  input: ChosenOptions | null | undefined,
): { chosen: ChosenOptions; missing: string[] } {
  const chosen: ChosenOptions = {};
  const missing: string[] = [];
  for (const q of questions) {
    if (q.pinned) {
      chosen[q.name] = q.pinned;
      continue;
    }
    const raw = typeof input?.[q.name] === "string" ? input[q.name]!.trim().slice(0, MAX_OPTION_VALUE_LENGTH) : "";
    const value = q.values.length > 0 ? (q.values.find((v) => v.toLowerCase() === raw.toLowerCase()) ?? "") : raw;
    if (value) chosen[q.name] = value;
    else missing.push(q.name);
  }
  return { chosen, missing };
}

/** A stored `chosen_options` value, defensively: only short string pairs survive. */
export function chosenOptionsOf(raw: unknown): ChosenOptions | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ChosenOptions = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_OPTIONS)) {
    if (typeof v === "string" && v.trim() && k.trim()) out[k.trim().slice(0, 40)] = v.trim().slice(0, MAX_OPTION_VALUE_LENGTH);
  }
  return Object.keys(out).length ? out : null;
}

/** "Size: M · Colour: Navy". */
export function formatChosenOptions(options: ChosenOptions | null | undefined): string | null {
  const parts = Object.entries(options ?? {}).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(" · ") : null;
}
