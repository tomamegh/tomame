import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import {
  fetchOxylabsAmazonProduct,
  fetchOxylabsWalmartProduct,
  isOxylabsConfigured,
  type OxylabsAmazonProduct,
  type OxylabsWalmartProduct,
} from "@/lib/oxylabs/client";
import { parseWeight } from "@/features/pricing/services/weight-parser";
import { amazonAsinOf, amazonDomainOf, defaultCurrencyForUrl } from "../url";
import { hasRequiredFields } from "./merge";
import { addVariant, cleanString, normalizeImages, parseRating, parseReviewCount } from "../scrapers/parse";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Walmart product id from /ip/<slug>/<id> or /ip/<id>. */
export function walmartProductIdOf(url: string): string | null {
  try {
    return new URL(url).pathname.match(/\/ip\/(?:[^/]+\/)?(\d{6,})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function mapOxylabsAmazon(item: OxylabsAmazonProduct, sourceUrl: string): PartialProduct {
  const details = item.product_details ?? {};
  const specs: Record<string, string> = {};
  for (const [k, v] of Object.entries(details)) if (k && typeof v === "string" && v) specs[humanizeKey(k)] = v;
  for (const t of item.technical_details ?? []) if (t?.name && t?.value && !(t.name in specs)) specs[t.name] = t.value;
  for (const o of item.product_overview ?? []) if (o?.title && o?.description && !(o.title in specs)) specs[o.title] = o.description;

  const breadcrumbs = (item.category ?? [])
    .flatMap((c) => c?.ladder ?? [])
    .map((l) => l?.name?.trim())
    .filter((n): n is string => !!n);

  const price = typeof item.price === "number" && item.price > 0 ? item.price : typeof item.price_buybox === "number" && item.price_buybox > 0 ? item.price_buybox : null;
  const weightText = details.item_weight ?? specs["Item Weight"] ?? null;
  const selected = item.variation?.find((v) => v?.selected)?.dimensions;
  const variants: Record<string, string[]> = {};
  for (const v of item.variation ?? []) for (const [k, val] of Object.entries(v?.dimensions ?? {})) addVariant(variants, k, val);
  const images = normalizeImages(item.images ?? []);

  return {
    title: (item.title ?? item.product_name)?.replace(/[\u200b\s]+$/g, "").trim() || null,
    image: images[0] ?? null,
    price,
    currency: price != null ? item.currency?.toUpperCase() ?? defaultCurrencyForUrl(sourceUrl) : null,
    description: item.bullet_points || item.description || null,
    brand: item.brand ?? item.manufacturer ?? null,
    size: selected?.Size ?? selected?.["Size Name"] ?? null,
    weight: weightText,
    weight_lbs: parseWeight(weightText),
    dimensions: item.product_dimensions ?? details.product_dimensions ?? null,
    specifications: specs,
    seller: cleanString(item.featured_merchant?.name),
    condition: null,
    rating: parseRating(item.rating),
    review_count: parseReviewCount(item.reviews_count),
    images,
    variants,
    availability: cleanString(item.stock),
    metadata: {
      images: item.images ?? [],
      breadcrumbs,
      asin: item.asin ?? amazonAsinOf(sourceUrl),
      rating: item.rating ?? null,
      reviewCount: item.reviews_count != null ? `${item.reviews_count} reviews` : null,
      availability: item.stock ?? null,
      listPrice: item.price_strikethrough || null,
      soldBy: item.featured_merchant?.name ?? null,
      variant: selected ? Object.values(selected).join(" · ") : null,
      source: "oxylabs",
    },
  };
}

export function mapOxylabsWalmart(item: OxylabsWalmartProduct, sourceUrl: string): PartialProduct {
  const general = item.general ?? {};
  const specs: Record<string, string> = {};
  for (const s of item.specifications ?? []) if (s?.key && s?.value) specs[s.key] = s.value;

  const breadcrumbs = (item.breadcrumbs ?? []).map((b) => b?.category_name?.trim()).filter((n): n is string => !!n);
  const price = typeof item.price?.price === "number" && item.price.price > 0 ? item.price.price : null;
  const weightText = Object.entries(specs).find(([k]) => /\bweight\b/i.test(k))?.[1] ?? null;
  const selected = item.variations?.find((v) => v?.state !== "OUT_OF_STOCK")?.selected_options ?? item.variations?.[0]?.selected_options ?? [];
  const messages: string[] = [];
  if (price == null && item.fulfillment?.out_of_stock) messages.push("Walmart lists this item as out of stock.");
  const variants: Record<string, string[]> = {};
  for (const v of item.variations ?? []) {
    if (v?.state === "OUT_OF_STOCK") continue;
    for (const o of v?.selected_options ?? []) if (o?.key) addVariant(variants, o.key, o.value);
  }
  const images = normalizeImages(general.images ?? [], general.main_image ?? null);
  const reviewCount = parseReviewCount(item.rating?.count);

  return {
    title: general.title ?? null,
    image: images[0] ?? null,
    price,
    currency: price != null ? item.price?.currency?.toUpperCase() ?? defaultCurrencyForUrl(sourceUrl) : null,
    description: general.description ?? null,
    brand: general.brand ?? null,
    size: specs["Size"] ?? selected.find((o) => /size/i.test(o?.key ?? ""))?.value ?? null,
    weight: weightText,
    weight_lbs: parseWeight(weightText),
    dimensions: Object.entries(specs).find(([k]) => /dimension/i.test(k))?.[1] ?? null,
    specifications: specs,
    seller: cleanString(item.seller?.name),
    condition: null,
    // A 0-star average over 0 reviews is "not rated", not a rating.
    rating: reviewCount === 0 ? null : parseRating(item.rating?.rating),
    review_count: reviewCount,
    images,
    variants,
    availability: item.fulfillment?.out_of_stock === true ? "Out of stock" : item.fulfillment?.out_of_stock === false ? "In stock" : null,
    metadata: {
      images: general.images ?? [],
      breadcrumbs,
      sku: general.meta?.sku ?? null,
      gtin: general.meta?.gtin ?? null,
      rating: item.rating?.rating ?? null,
      reviewCount: item.rating?.count != null ? `${item.rating.count} reviews` : null,
      availability: item.fulfillment?.out_of_stock ? "Out of stock" : "In stock",
      listPrice: item.price?.price_strikethrough || null,
      soldBy: item.seller?.name ?? null,
      variant: selected.map((o) => o?.value).filter(Boolean).join(" · ") || null,
      source: "oxylabs",
    },
  };
}

/**
 * Oxylabs realtime parsed targets — Amazon (second source, carries item weight)
 * and Walmart (primary). Hedged: starts if the tier before it has not answered
 * within `hedgeAfterMs`, and only runs while title/price are still unknown.
 */
export const oxylabsResolver: ExtractionResolver = {
  name: "oxylabs",
  defaultConfidence: 0.92,
  needsHtml: false,
  startAfterMs: EXTRACTION.hedgeAfterMs,
  available: (ctx) => isOxylabsConfigured() && (ctx.platform === "amazon" || ctx.platform === "walmart"),
  shouldRun: (ctx) => !hasRequiredFields(ctx.current),
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (ctx.deadline - Date.now() < 3_000) return { product: {} };
    try {
      if (ctx.platform === "amazon") {
        const asin = amazonAsinOf(ctx.url);
        if (!asin) return { product: {} };
        const domain = amazonDomainOf(ctx.url).replace(/^amazon\./, "");
        const item = await fetchOxylabsAmazonProduct(asin, domain, ctx.signal);
        if (!item) return { product: {} };
        const product = mapOxylabsAmazon(item, ctx.url);
        const messages: string[] = [];
        if (product.price == null && item.stock && !/in stock/i.test(item.stock)) messages.push(`Amazon lists this item as "${item.stock}".`);
        return { product, messages };
      }
      const id = walmartProductIdOf(ctx.url);
      if (!id) return { product: {} };
      const item = await fetchOxylabsWalmartProduct(id, ctx.signal);
      if (!item) return { product: {} };
      const product = mapOxylabsWalmart(item, ctx.url);
      return { product, messages: product.price == null && item.fulfillment?.out_of_stock ? ["Walmart lists this item as out of stock."] : [] };
    } catch (err) {
      logger.warn("oxylabs resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
