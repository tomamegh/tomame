import { TomameCategory } from "@/config/categories";
import type { ExtractionSource } from "@/config/extraction";
import type { ScrapedProduct } from "./scrapers/types";

/**
 * "A price you can trust, or no price" (plan A0, A3). Pure rules over what the
 * resolver chain read; no I/O, so every rule is a unit test.
 *
 *   confirmed     — two independent reads agree, or one structured tier read
 *                   the exact offer the link names. Payable.
 *   single_source — one read only. Shown; re-read in the background before Pay.
 *   unconfirmed   — HTML-only, reads disagree, implausible, wrong currency,
 *                   used/renewed offer on a new-item page, Subscribe & Save,
 *                   coupon or per-unit price. Shown; Pay blocked until staff confirm.
 *
 * And before any of that, `guardHtmlPrice` throws out an HTML-only price the
 * page itself contradicts, so it is never quoted at all (A3).
 */

export type PriceConfidence = "confirmed" | "single_source" | "unconfirmed";

export type PriceReason =
  | "reads_agree"
  | "exact_offer"
  | "one_read"
  | "html_only"
  | "reads_disagree"
  | "implausible"
  | "currency_mismatch"
  | "used_offer"
  | "subscribe_and_save"
  | "coupon"
  | "per_unit"
  | "geo_blocked"
  | "variant_mismatch";

/** One tier's reading of the price, as the chain merged it. */
export interface PriceRead {
  source: ExtractionSource;
  price: number;
  currency: string | null;
  /** Which markup or vendor field it came from, when the tier says ("page-offer", "whole-fraction"). */
  via?: string | null;
}

export interface PriceVerdict {
  level: PriceConfidence;
  reasons: PriceReason[];
  /** The tier the quoted price came from. */
  source: ExtractionSource | null;
}

/** Two reads agree when they are within this share of each other. */
export const PRICE_AGREEMENT = 0.02;

/** Tiers that read the page we fetched ourselves (or a model's reading of it). */
export const HTML_TIERS: ReadonlySet<ExtractionSource> = new Set<ExtractionSource>(["platform-html", "structured-data", "llm", "apify"]);

/**
 * Tiers that answer for exactly the item the link names: an ASIN, an eBay item
 * id, a Walmart product id, a Shopify variant. Zyte is an AI reading of the
 * page and is exact only when the page's own offer agrees with it.
 */
const EXACT_TIERS: ReadonlySet<ExtractionSource> = new Set<ExtractionSource>(["scraperapi", "amazon-offers", "oxylabs", "rainforest", "ebay", "shopify"]);

const CEILING_HIGH = 15_000;
const CEILING_DEFAULT = 2_500;
const CEILING_UNKNOWN = 5_000;
const PRICE_FLOOR = 0.5;

/** Categories where a single item can honestly cost thousands of dollars. */
const HIGH_VALUE = new Set<string>([
  TomameCategory.ELECTRONICS, TomameCategory.COMPUTERS, TomameCategory.CELL_PHONES, TomameCategory.TV_VIDEO,
  TomameCategory.CAMERA_PHOTO, TomameCategory.VIDEO_GAMES, TomameCategory.WEARABLE_TECHNOLOGY, TomameCategory.SMART_HOME,
  TomameCategory.APPLIANCES, TomameCategory.FURNITURE, TomameCategory.OFFICE_FURNITURE, TomameCategory.OFFICE_ELECTRONICS,
  TomameCategory.JEWELRY, TomameCategory.WATCHES, TomameCategory.AUTOMOTIVE, TomameCategory.CAR_ELECTRONICS,
  TomameCategory.MUSICAL_INSTRUMENTS, TomameCategory.COLLECTIBLES, TomameCategory.ANTIQUES, TomameCategory.CYCLING,
  TomameCategory.EXERCISE_FITNESS, TomameCategory.MEDICAL_SUPPLIES, TomameCategory.TOOLS, TomameCategory.HOME_IMPROVEMENT,
  TomameCategory.GARDEN_OUTDOOR, TomameCategory.HANDBAGS,
]);

/** The most a single item in this category plausibly costs, in the listing's currency (USD/GBP). */
export function priceCeilingFor(category: string | null | undefined): number {
  if (!category) return CEILING_UNKNOWN;
  return HIGH_VALUE.has(category) ? CEILING_HIGH : CEILING_DEFAULT;
}

export function isPlausiblePrice(price: number, category: string | null | undefined): boolean {
  return Number.isFinite(price) && price >= PRICE_FLOOR && price <= priceCeilingFor(category);
}

export function pricesAgree(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / Math.max(a, b) <= PRICE_AGREEMENT;
}

function metaFlags(product: ScrapedProduct): string[] {
  const raw = product.metadata?.priceFlags;
  return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [];
}

/** Same-page readings a Cheerio parser left in `metadata.pagePrices`. */
export function pagePricesOf(product: ScrapedProduct): Array<{ via: string; price: number }> {
  const raw = product.metadata?.pagePrices;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ via: string; price: number }> = [];
  for (const r of raw) {
    if (r && typeof r === "object" && typeof (r as { price?: unknown }).price === "number") {
      out.push({ via: String((r as { via?: unknown }).via ?? "page"), price: (r as { price: number }).price });
    }
  }
  return out;
}

const NEW_ITEM_TITLE = /\b(renewed|refurbished|used|pre-?owned|open box)\b/i;

export interface PriceConfidenceInput {
  /** The listing currency the store prices in (`StoreDefinition.currency`). */
  storeCurrency: string;
  product: ScrapedProduct;
  /** Tier that supplied the merged price. */
  priceSource: ExtractionSource | null;
  reads: readonly PriceRead[];
}

/**
 * The confidence verdict for a product's quoted price. Null when there is no
 * price to judge.
 */
export function assessPriceConfidence(input: PriceConfidenceInput): PriceVerdict | null {
  const { product, priceSource, storeCurrency } = input;
  const price = product.price;
  if (price == null || !(price > 0)) return null;

  const reads = input.reads.filter((r) => r.price > 0);
  const flags = metaFlags(product);
  const hard: PriceReason[] = [];

  const others = reads.filter((r) => r.source !== priceSource);
  // Our own page parse does not overrule a vendor's exact-item read; it only corroborates it.
  const exactSource = priceSource != null && EXACT_TIERS.has(priceSource);
  if (others.some((r) => !pricesAgree(r.price, price) && !(exactSource && HTML_TIERS.has(r.source)))) hard.push("reads_disagree");
  if (!isPlausiblePrice(price, product.category)) hard.push("implausible");
  const currency = product.currency?.toUpperCase() ?? null;
  if (currency && currency !== storeCurrency.toUpperCase()) hard.push("currency_mismatch");
  // A used/renewed offer's price on a page selling the item as new.
  if (flags.includes("used_offer") && !NEW_ITEM_TITLE.test(product.title ?? "")) hard.push("used_offer");
  for (const f of ["subscribe_and_save", "coupon", "per_unit"] as const) if (flags.includes(f)) hard.push(f);
  if (product.metadata?.geoBlocked === true) hard.push("geo_blocked");
  if (product.metadata?.asinMismatch === true) hard.push("variant_mismatch");

  const agreeing = others.filter((r) => pricesAgree(r.price, price));
  const pageAgrees = priceSource === "zyte" && product.metadata?.pageOfferAgrees === true;
  const independent = agreeing.length > 0 || pageAgrees;
  // Only tiers that read a page we fetched, and nothing from a vendor agreeing with it.
  const htmlOnly = priceSource != null && HTML_TIERS.has(priceSource) && !agreeing.some((r) => !HTML_TIERS.has(r.source));
  if (htmlOnly) hard.push("html_only");

  if (hard.length > 0) return { level: "unconfirmed", reasons: dedupe(hard), source: priceSource };
  if (independent) return { level: "confirmed", reasons: ["reads_agree"], source: priceSource };
  if (exactSource) return { level: "confirmed", reasons: ["exact_offer"], source: priceSource };
  return { level: "single_source", reasons: ["one_read"], source: priceSource };
}

export type HtmlPriceRejection = "page_disagrees" | "implausible" | "geo_blocked_currency";

/**
 * A3: an HTML-only price is thrown out (the quote falls back to "enter the
 * price, our team verifies it") when the same page contradicts it, when it is
 * implausible for the category, or when the page was read from outside the
 * store's country in another currency. Prices a vendor tier agreed with are
 * never thrown out here.
 */
export function guardHtmlPrice(input: PriceConfidenceInput): HtmlPriceRejection | null {
  const { product, priceSource } = input;
  const price = product.price;
  if (price == null || !(price > 0) || !priceSource || !HTML_TIERS.has(priceSource)) return null;
  const vendorAgrees = input.reads.some((r) => !HTML_TIERS.has(r.source) && pricesAgree(r.price, price));
  if (vendorAgrees) return null;
  const page = pagePricesOf(product);
  if (page.some((p) => !pricesAgree(p.price, price))) return "page_disagrees";
  if (!isPlausiblePrice(price, product.category)) return "implausible";
  const currency = product.currency?.toUpperCase() ?? null;
  if (product.metadata?.geoBlocked === true && currency && currency !== input.storeCurrency.toUpperCase()) return "geo_blocked_currency";
  return null;
}

/** What the customer is told when a price was thrown out by `guardHtmlPrice`. */
export const PRICE_REJECTED_MESSAGE = "We couldn't confirm the price on this page. Enter the price you see and our team will verify it before you pay.";

export type RereadVerdict =
  | { outcome: "agree"; read: PriceRead }
  | { outcome: "disagree"; read: PriceRead }
  | { outcome: "none" };

/**
 * The background re-read of a single-source price (A0): any independent
 * reading within 2% confirms it; readings that all differ send it to staff;
 * no reading at all is "none" (the hold lapses rather than blocking a sale on
 * a vendor outage). Readings in another currency are ignored.
 */
export function judgeReread(quoted: { price: number; currency: string | null }, reads: readonly PriceRead[]): RereadVerdict {
  const comparable = reads.filter((r) => r.price > 0 && (!r.currency || !quoted.currency || r.currency.toUpperCase() === quoted.currency.toUpperCase()));
  const agree = comparable.find((r) => pricesAgree(r.price, quoted.price));
  if (agree) return { outcome: "agree", read: agree };
  const first = comparable[0];
  return first ? { outcome: "disagree", read: first } : { outcome: "none" };
}

/** Plain words for staff (queue, alert) for each reason. */
export const PRICE_REASON_LABELS: Record<PriceReason, string> = {
  reads_agree: "Two reads agree",
  exact_offer: "Exact offer read by a store API",
  one_read: "Only one read",
  html_only: "Read only from the page HTML",
  reads_disagree: "Two reads disagree by more than 2%",
  implausible: "Implausible for the category",
  currency_mismatch: "Not in the store's currency",
  used_offer: "Price is a used or renewed offer",
  subscribe_and_save: "Subscribe & Save price",
  coupon: "A coupon is on the page",
  per_unit: "Per-unit price",
  geo_blocked: "Page was read from outside the store's country",
  variant_mismatch: "Vendor answered for another variant",
};

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Customer-facing copy for a hold on an unconfirmed price. */
export const PRICE_CONFIRMING_MESSAGE = "We're confirming this price";
