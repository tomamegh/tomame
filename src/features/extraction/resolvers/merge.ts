import type { ExtractionSource } from "@/config/extraction";
import type { ScrapedProduct } from "../scrapers";
import { addVariant, cleanTitle, normalizeImageUrl } from "../scrapers/parse";
import type { PartialProduct, ResolverResult } from "./types";

type Field = keyof ScrapedProduct;

const SCALAR_FIELDS: Field[] = [
  "title", "image", "price", "currency", "description", "brand",
  "category", "size", "weight", "weight_lbs", "dimensions",
  "seller", "condition", "rating", "review_count", "availability",
];

export interface MergeState {
  product: ScrapedProduct;
  confidence: Partial<Record<Field, number>>;
  sources: Partial<Record<Field, ExtractionSource>>;
}

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

function sane(field: Field, v: unknown): boolean {
  if (field === "price" || field === "weight_lbs") return typeof v === "number" && v > 0;
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
      if (k && isPresent(v) && !(k in state.product.specifications)) state.product.specifications[k] = v;
    }
  }
  if (incoming.metadata) {
    for (const [k, v] of Object.entries(incoming.metadata)) {
      if (k && isPresent(v) && !(k in state.product.metadata)) state.product.metadata[k] = v;
    }
  }

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
