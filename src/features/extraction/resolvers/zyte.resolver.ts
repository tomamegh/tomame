import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { fetchZyteProduct, isZyteConfigured, type ZyteProduct } from "@/lib/zyte/client";
import { parseWeight } from "@/features/pricing/services/weight-parser";
import { hasRequiredFields } from "./merge";
import { addVariant, cleanTitle, normalizeImages, parseAggregateRating, parseSchemaAvailability } from "../scrapers/parse";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

const SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "¥": "CNY", "US$": "USD" };

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "Visit the Samsung Store" → "Samsung". */
function cleanBrand(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^(?:Visit the |Brand:\s*)(.+?)(?:\s+Store)?$/i);
  return (m?.[1] ?? raw).trim() || null;
}

export function mapZyteProduct(item: ZyteProduct, fallbackCurrency: string): PartialProduct {
  const specs: Record<string, string> = {};
  for (const p of item.additionalProperties ?? []) {
    if (p?.name && p?.value) specs[p.name.replace(/\b\w/g, (c) => c.toUpperCase())] = p.value;
  }
  const breadcrumbs = (item.breadcrumbs ?? []).map((b) => b?.name?.trim()).filter((n): n is string => !!n);

  // `price` is the current price; `regularPrice` is the strike-through. An
  // out-of-stock item often carries only regularPrice — we never quote that.
  const price = num(item.price);
  const currency = price == null ? null : item.currency?.toUpperCase() ?? (item.currencyRaw ? SYMBOL_CURRENCY[item.currencyRaw] : undefined) ?? fallbackCurrency;
  const weightText = Object.entries(specs).find(([k]) => /\bweight\b/i.test(k))?.[1] ?? null;
  const rawImages = (item.images ?? []).map((i) => i?.url).filter((u): u is string => !!u);
  const images = normalizeImages(rawImages, item.mainImage?.url ?? null);
  const variant = [item.color, item.size, item.style].filter(Boolean).join(" · ") || null;
  const { rating, review_count } = parseAggregateRating(item.aggregateRating);

  // Zyte lists sibling variants as { color?, size?, style? }. Walmart pollutes
  // the value with price/stock text ("Gray, was $1,469.00, Out of stock") —
  // those are not available options and are dropped rather than cleaned.
  const variants: Record<string, string[]> = {};
  if (Array.isArray(item.variants)) {
    for (const v of item.variants) {
      if (!v || typeof v !== "object") continue;
      for (const key of ["color", "size", "style"] as const) {
        const val = (v as Record<string, unknown>)[key];
        if (typeof val === "string" && !/out of stock|sold out|,\s*was\s/i.test(val)) addVariant(variants, key, val);
      }
    }
  }

  return {
    title: cleanTitle(item.name),
    image: images[0] ?? null,
    price,
    currency,
    description: item.description ?? (item.features?.length ? item.features.join("\n") : null),
    brand: cleanBrand(item.brand?.name),
    size: item.size ?? null,
    weight: weightText,
    weight_lbs: parseWeight(weightText),
    dimensions: Object.entries(specs).find(([k]) => /dimension/i.test(k))?.[1] ?? null,
    specifications: specs,
    seller: null,
    condition: null,
    rating,
    review_count,
    images,
    variants,
    availability: parseSchemaAvailability(item.availability),
    metadata: {
      images: rawImages,
      breadcrumbs,
      sku: item.sku ?? null,
      gtin: item.gtin?.[0]?.value ?? null,
      availability: item.availability ?? null,
      listPrice: num(item.regularPrice),
      color: item.color ?? null,
      variant,
      probability: item.metadata?.probability ?? null,
      source: "zyte",
    },
  };
}

/**
 * Zyte automatic product extraction — the tier that makes "any store" work.
 * Reads from the plain HTTP response (fast, cheap); JS-only stores fall
 * through to the browser HTML source + page parsers.
 */
export const zyteResolver: ExtractionResolver = {
  name: "zyte",
  defaultConfidence: 0.85,
  needsHtml: false,
  startAfterMs: EXTRACTION.hedgeAfterMs,
  available: () => isZyteConfigured(),
  shouldRun: (ctx) => !hasRequiredFields(ctx.current),
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (ctx.deadline - Date.now() < 3_000) return { product: {} };
    try {
      const item = await fetchZyteProduct(ctx.url, { signal: ctx.signal, geolocation: ctx.region === "UK" ? "GB" : "US" });
      if (!item) return { product: {} };
      const product = mapZyteProduct(item, ctx.scraper.defaultCurrency);
      const messages: string[] = [];
      if (product.price == null && item.availability && /outofstock|discontinued/i.test(item.availability)) {
        messages.push("The store lists this item as out of stock.");
      }
      return { product, messages };
    } catch (err) {
      logger.warn("zyte resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
