import type { ExtractionSource } from "@/config/extraction";
import type { ScrapedProduct } from "../scrapers";
import { logger } from "@/lib/logger";
import { addVariant, cleanTitle, looksLikeScript, normalizeImageUrl } from "../scrapers/parse";
import type { PartialProduct, ResolverResult } from "./types";

type Field = keyof ScrapedProduct;

const SCALAR_FIELDS: Field[] = [
  "title", "image", "price", "currency", "description", "brand",
  "category", "size", "weight", "weight_lbs", "dimensions",
  "seller", "condition", "rating", "review_count", "availability", "store_shipping",
];

export interface MergeState {
  product: ScrapedProduct;
  confidence: Partial<Record<Field, number>>;
  sources: Partial<Record<Field, ExtractionSource>>;
  /** Fields refused because the value was script or JSON, not copy (A2). Counted in daily health. */
  leaked?: Array<{ field: string; source: ExtractionSource }>;
  /** Every tier's own price beside its list price, to corroborate a list price across tiers. */
  listPriceReads?: Array<{ price: number; currency: string | null; listPrice: number }>;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * The winning tier gave no list price, but another tier read the SAME price
 * and its strike-through beside it: that strike-through describes this offer
 * too, so it may stand ("30% off Amazon's $138.00 list price"). Never from a
 * tier that read a different price.
 */
function adoptCorroboratedListPrice(state: MergeState): void {
  const price = state.product.price;
  if (typeof price !== "number" || typeof state.product.metadata.listPrice === "number") return;
  const currency = state.product.currency ?? null;
  const match = state.listPriceReads?.find((r) => cents(r.price) === cents(price) && r.listPrice > price && (!r.currency || !currency || r.currency === currency));
  if (match) state.product.metadata.listPrice = match.listPrice;
}

/** Metadata about the offer a price was read from; it travels with the winning price only. */
const PRICE_METADATA = ["listPrice", "priceSource", "priceFlags", "pagePrices", "priceVia", "geoBlocked", "pageOfferAgrees", "asinMismatch"];

/** Shopper-facing text fields the script guard checks. */
const TEXT_FIELDS = new Set<Field>(["title", "description", "brand", "size", "weight", "dimensions", "seller", "condition", "availability"]);

function noteLeak(state: MergeState, field: string, source: ExtractionSource, value: string): void {
  (state.leaked ??= []).push({ field, source });
  logger.warn("extraction: dropped a scraped field that is script, not text", { field, source, sample: value.slice(0, 80) });
}

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

function sane(field: Field, v: unknown): boolean {
  if (field === "price" || field === "weight_lbs") return typeof v === "number" && v > 0;
  // 0 is a real answer (free shipping), unlike price and weight.
  if (field === "store_shipping") return typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (field === "currency") return typeof v === "string" && /^[A-Z]{3}$/.test(v);
  if (field === "image") return typeof v === "string" && /^(https?:)?\/\//.test(v);
  if (field === "title") return typeof v === "string" && v.trim().length >= 3;
  if (field === "rating") return typeof v === "number" && v >= 0 && v <= 5;
  if (field === "review_count") return typeof v === "number" && Number.isInteger(v) && v >= 0;
  return true;
}

/** Same bar as the `image` scalar: an absolute or protocol-relative URL. */
function saneImageUrl(v: unknown): string | null {
  const u = normalizeImageUrl(v);
  return u && /^https?:\/\//.test(u) ? u : null;
}

/**
 * Field-by-field merge. A later resolver only replaces a value when it is
 * more confident about that specific field. `specifications` and `metadata`
 * are unioned (earlier values win on key collisions). `images` is an ordered
 * union (earlier resolver's order first, de-duplicated) kept in step with the
 * winning `image`; `variants` is a key union where the earlier resolver wins
 * per key.
 */
export function mergeResult(state: MergeState, source: ExtractionSource, result: ResolverResult, defaultConfidence: number): void {
  const incoming: PartialProduct = result.product ?? {};

  for (const field of SCALAR_FIELDS) {
    let value = incoming[field];
    if (field === "title" && typeof value === "string") value = cleanTitle(value);
    if (!isPresent(value) || !sane(field, value)) continue;
    if (TEXT_FIELDS.has(field) && looksLikeScript(value)) {
      noteLeak(state, field, source, String(value));
      continue;
    }
    const conf = result.confidence?.[field] ?? defaultConfidence;
    const existing = state.confidence[field] ?? -1;
    if (!isPresent(state.product[field]) || conf > existing) {
      (state.product as unknown as Record<string, unknown>)[field] = value;
      state.confidence[field] = conf;
      state.sources[field] = source;
    }
  }

  if (incoming.specifications) {
    for (const [k, v] of Object.entries(incoming.specifications)) {
      if (!k || !isPresent(v) || k in state.product.specifications) continue;
      if (looksLikeScript(v)) {
        noteLeak(state, `specifications.${k}`, source, String(v));
        continue;
      }
      state.product.specifications[k] = v;
    }
  }
  if (incoming.metadata) {
    // The strike-through price and the price's provenance follow the price:
    // a vendor's listPrice must not sit beside the page's own offer.
    const ownsPrice = state.sources.price === source && isPresent(incoming.price);
    if (ownsPrice) {
      for (const k of PRICE_METADATA) {
        if (k in incoming.metadata) state.product.metadata[k] = incoming.metadata[k];
        else delete state.product.metadata[k];
      }
    }
    for (const [k, v] of Object.entries(incoming.metadata)) {
      // One tier's offer facts (its page's coupon, its geo) never describe another tier's price.
      if (PRICE_METADATA.includes(k) && !ownsPrice) continue;
      if (k && isPresent(v) && !(k in state.product.metadata)) state.product.metadata[k] = v;
    }
    const lp = incoming.metadata.listPrice;
    if (typeof lp === "number" && Number.isFinite(lp) && typeof incoming.price === "number") {
      (state.listPriceReads ??= []).push({ price: incoming.price, currency: incoming.currency ?? null, listPrice: lp });
    }
  }
  adoptCorroboratedListPrice(state);

  if (Array.isArray(incoming.images)) {
    for (const raw of incoming.images) {
      const u = saneImageUrl(raw);
      if (u && !state.product.images.includes(u)) state.product.images.push(u);
    }
  }
  // Keep images[0] === image: the winning main image leads the gallery.
  const main = saneImageUrl(state.product.image);
  if (main) {
    const idx = state.product.images.indexOf(main);
    if (idx > 0) state.product.images.splice(idx, 1);
    if (idx !== 0) state.product.images.unshift(main);
  }

  if (incoming.variants && typeof incoming.variants === "object" && !Array.isArray(incoming.variants)) {
    for (const [k, list] of Object.entries(incoming.variants)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      const scratch: Record<string, string[]> = {};
      for (const v of list) addVariant(scratch, k, v);
      for (const [key, values] of Object.entries(scratch)) {
        if (values.length && !(key in state.product.variants)) state.product.variants[key] = values;
      }
    }
  }
}

/** Title, price and currency are what pricing needs. Everything else is nice-to-have. */
export function hasRequiredFields(p: ScrapedProduct): boolean {
  return isPresent(p.title) && isPresent(p.price) && isPresent(p.currency);
}

export function hasWeight(p: ScrapedProduct): boolean {
  return typeof p.weight_lbs === "number" && p.weight_lbs > 0;
}

/** Fields the LLM tier should try to fill. */
export function missingFields(p: ScrapedProduct): Field[] {
  const wanted: Field[] = ["title", "price", "currency", "image", "brand", "category", "weight_lbs", "dimensions"];
  return wanted.filter((f) => !isPresent(p[f]));
}
