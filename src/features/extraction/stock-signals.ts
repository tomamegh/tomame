import type { ScrapedProduct } from "./scrapers/types";

/**
 * When Tomame must confirm stock and condition before a customer pays (A7, the
 * Lamptey lesson). Pure: read off the product the chain already has, so old
 * cache rows are judged by the same rules as new ones.
 *
 * Triggers (decided 2026-11-20): a condition that is not New (Renewed,
 * Refurbished, Used, Open box — stated by the store or in the title), "Only N
 * left" with N ≤ 3, "Temporarily out of stock", "Usually ships within …", and
 * lightning / limited-time deals.
 */

export type StockSignalCode = "condition" | "low_stock" | "temporarily_out" | "slow_dispatch" | "deal";

export interface StockSignal {
  code: StockSignalCode;
  /** Customer words. */
  label: string;
}

/** "Only N left" at or below this triggers a check. */
export const LOW_STOCK_THRESHOLD = 3;

const NON_NEW_CONDITION = /\b(renewed|refurbished|reconditioned|used|pre-?owned|open[- ]box|like new|very good|good|acceptable|for parts|seller refurbished|certified refurbished)\b/i;
const TITLE_CONDITION: Array<[RegExp, string]> = [
  [/\bamazon renewed\b|\(renewed(?: premium)?\)|\brenewed premium\b/i, "Renewed"],
  [/\((?:certified |seller )?refurbished\)|\bcertified refurbished\b|\brefurbished\b/i, "Refurbished"],
  [/\bopen[- ]box\b/i, "Open box"],
  [/\bpre-?owned\b|\((?:used)\)|\bused\b(?= *[-–(]| *condition)/i, "Used"],
];

function conditionOf(product: ScrapedProduct): string | null {
  const stated = product.condition?.trim();
  if (stated && !/^new\b/i.test(stated) && NON_NEW_CONDITION.test(stated)) return stated;
  const title = product.title ?? "";
  for (const [re, label] of TITLE_CONDITION) if (re.test(title)) return label;
  return null;
}

function availabilityOf(product: ScrapedProduct): string {
  const meta = product.metadata?.availability;
  return [product.availability, typeof meta === "string" ? meta : null].filter(Boolean).join(" · ");
}

export function detectStockSignals(product: ScrapedProduct): StockSignal[] {
  const out: StockSignal[] = [];
  const condition = conditionOf(product);
  if (condition) out.push({ code: "condition", label: `${condition} item` });

  const availability = availabilityOf(product);
  const left = availability.match(/\bonly\s+(\d+)\s+left\b/i);
  if (left?.[1] && Number(left[1]) <= LOW_STOCK_THRESHOLD) out.push({ code: "low_stock", label: `Only ${left[1]} left` });
  if (/temporarily (?:out of stock|unavailable)/i.test(availability)) out.push({ code: "temporarily_out", label: "Temporarily out of stock" });
  const ships = availability.match(/usually ships within [^.·]+/i);
  if (ships) out.push({ code: "slow_dispatch", label: capitalise(ships[0].trim()) });

  const deal = typeof product.metadata?.deal === "string" ? product.metadata.deal : null;
  const dealText = [deal, product.title].filter(Boolean).join(" ");
  if (/lightning deal|limited[- ]time deal|deal ends in/i.test(dealText)) out.push({ code: "deal", label: deal ? capitalise(deal) : "Limited-time deal" });
  return out;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A store phrase that means "you cannot buy this now". */
export const UNAVAILABLE_PHRASE = /out ?of ?stock|unavailable|discontinued|sold out|no longer available/i;

/**
 * The store itself said the item cannot be bought (a title, no price, and an
 * out-of-stock phrase) — as opposed to a read that simply failed. A re-read
 * that says so replaces an older priced read; a failed one never does.
 */
export function storeSaysUnavailable(product: ScrapedProduct): boolean {
  if (!product.title || product.price != null) return false;
  return UNAVAILABLE_PHRASE.test(availabilityOf(product));
}

/** Customer-facing copy (plan A7). */
export const STOCK_CHECK_MESSAGE = "We confirm stock and condition before you pay";
export const STOCK_UNAVAILABLE_MESSAGE = "This item is no longer available from the store";
/** How long a staff confirmation holds. */
export const STOCK_CONFIRMATION_HOURS = 24;
