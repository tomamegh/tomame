import type { ExtractionSource } from "@/config/extraction";
import type { ScrapedProduct } from "../scrapers";
import type { PartialProduct, ResolverResult } from "./types";

type Field = keyof ScrapedProduct;

const SCALAR_FIELDS: Field[] = [
  "title", "image", "price", "currency", "description", "brand",
  "category", "size", "weight", "weight_lbs", "dimensions",
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
  return true;
}

/**
 * Field-by-field merge. A later resolver only replaces a value when it is
 * more confident about that specific field. `specifications` and `metadata`
 * are unioned (earlier values win on key collisions).
 */
export function mergeResult(state: MergeState, source: ExtractionSource, result: ResolverResult, defaultConfidence: number): void {
  const incoming: PartialProduct = result.product ?? {};

  for (const field of SCALAR_FIELDS) {
    const value = incoming[field];
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
