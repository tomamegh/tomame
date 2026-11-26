import type { ScrapedProduct } from "./scrapers/types";

/**
 * The sizes, colours and other options a listing sells, as the store itself
 * publishes them, kept in the snapshot at `metadata.variantChoices`. The quote
 * screen draws a picker from it; a pick re-reads the store's own link for that
 * variant, so the price still comes from a server read, never from here.
 *
 * Only Shopify publishes the whole list with stock today (`via: "shopify"`).
 */
export interface VariantChoice {
  id: string;
  /** Option name → value, e.g. { Size: "M", Color: "Navy" }. */
  options: Record<string, string>;
  /** False when the store says this one is sold out; null when it does not say. */
  available: boolean | null;
}

export interface VariantChoices {
  via: "shopify";
  /** Option names in the store's order, each with its values in the store's order. */
  options: Array<{ name: string; values: string[] }>;
  choices: VariantChoice[];
  /** The variant this snapshot priced. */
  selectedId: string | null;
}

/** Shopify allows 2,048 variants; a picker past this many is not one a customer can use. */
export const MAX_VARIANT_CHOICES = 250;

const isRecordOfStrings = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/** The snapshot's variant list, or null when there is nothing to choose between. Tolerates any stored shape. */
export function variantChoicesOf(product: { metadata?: ScrapedProduct["metadata"] } | null | undefined): VariantChoices | null {
  const raw = product?.metadata?.variantChoices as Partial<VariantChoices> | undefined;
  if (!raw || typeof raw !== "object" || raw.via !== "shopify") return null;
  if (!Array.isArray(raw.options) || !Array.isArray(raw.choices)) return null;
  const options = raw.options
    .filter((o): o is { name: string; values: string[] } => !!o && typeof o.name === "string" && Array.isArray(o.values))
    .map((o) => ({ name: o.name, values: o.values.filter((v): v is string => typeof v === "string") }))
    .filter((o) => o.values.length > 0);
  const choices = raw.choices
    .filter((c): c is VariantChoice => !!c && typeof c.id === "string" && /^\d{1,20}$/.test(c.id) && isRecordOfStrings(c.options))
    .map((c) => ({ id: c.id, options: c.options, available: typeof c.available === "boolean" ? c.available : null }));
  if (options.length === 0 || choices.length < 2) return null;
  const selectedId = typeof raw.selectedId === "string" && choices.some((c) => c.id === raw.selectedId) ? raw.selectedId : null;
  return { via: "shopify", options, choices, selectedId };
}

/**
 * The store link for one of the snapshot's variants, built on the server from
 * the snapshot's own (canonical) link; null when the id is not one the snapshot lists.
 */
export function variantUrlFor(productUrl: string, choices: VariantChoices, variantId: string): string | null {
  if (!choices.choices.some((c) => c.id === variantId)) return null;
  try {
    const u = new URL(productUrl);
    u.hash = "";
    u.searchParams.set("variant", variantId);
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * The variant to switch to when the customer picks `value` for `option`: the
 * one matching the pick and as many of the current other options as possible,
 * preferring in-stock. Null when no variant has that value.
 */
export function choiceForPick(choices: VariantChoices, option: string, value: string): VariantChoice | null {
  const current = choices.choices.find((c) => c.id === choices.selectedId)?.options ?? {};
  const matching = choices.choices.filter((c) => c.options[option] === value);
  if (matching.length === 0) return null;
  const score = (c: VariantChoice) =>
    (c.available === false ? 0 : 100) + Object.entries(current).filter(([k, v]) => k !== option && c.options[k] === v).length;
  return matching.reduce((best, c) => (score(c) > score(best) ? c : best));
}

/** Whether any variant with `value` for `option` (and the current other options) is in stock. */
export function valueState(choices: VariantChoices, option: string, value: string): "selected" | "available" | "sold_out" | "other" {
  const current = choices.choices.find((c) => c.id === choices.selectedId);
  if (current?.options[option] === value) return "selected";
  const pick = choiceForPick(choices, option, value);
  if (!pick) return "sold_out";
  if (pick.available === false) return "sold_out";
  // In stock, but only by also changing another option the customer already chose.
  const keepsOthers = current ? Object.entries(current.options).every(([k, v]) => k === option || pick.options[k] === v) : true;
  return keepsOthers ? "available" : "other";
}
