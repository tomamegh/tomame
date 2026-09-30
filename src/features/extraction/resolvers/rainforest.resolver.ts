import { logger } from "@/lib/logger";
import { fetchAmazonProduct, isRainforestConfigured, type RainforestProduct } from "@/lib/rainforest/client";
import { TomameCategory, AMAZON_CATEGORY_MAP } from "@/config/categories";
import { cleanSpecValue, dimensionsFromSpecs, parseWeightLbs, weightFromSpecs, weightInDimensions } from "../weight";
import { EXTRACTION } from "@/config/extraction";
import { hasRequiredFields } from "./merge";
import { amazonAsinOf, amazonDomainOf } from "../url";
import { cleanString, humanizeToken, normalizeImages, parseRating, parseReviewCount } from "../scrapers/parse";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

/** Rainforest product record → partial product. Exported for tests. */
export function mapRainforestProduct(item: RainforestProduct): PartialProduct {
  const specs: Record<string, string> = {};
  for (const s of item.specifications ?? []) {
    if (s?.name && s?.value) specs[s.name] = s.value;
  }

  let category: TomameCategory | null = null;
  const crumbs = (item.categories ?? []).map((c) => c?.name).filter((n): n is string => !!n);
  for (const name of crumbs) {
    const mapped = AMAZON_CATEGORY_MAP.get(name);
    if (mapped) {
      category = mapped;
      break;
    }
  }

  const price = item.buybox_winner?.price;
  const dimensions = cleanSpecValue(item.dimensions) ?? dimensionsFromSpecs(specs);
  const direct = cleanSpecValue(item.weight);
  const fromSpecs = direct ? null : weightFromSpecs(specs);
  const weightText = direct ?? fromSpecs?.text ?? weightInDimensions(dimensions);
  const weightLbs = fromSpecs?.lbs ?? parseWeightLbs(weightText);
  const rawImages = (item.images ?? []).map((i) => i?.link).filter((l): l is string => !!l);
  const images = normalizeImages(rawImages, item.main_image?.link ?? null);
  const bb = item.buybox_winner;
  const conditionTitle = cleanString((bb?.condition as { title?: unknown } | undefined)?.title);

  return {
    title: item.title ?? null,
    image: images[0] ?? null,
    price: typeof price?.value === "number" && price.value > 0 ? price.value : null,
    currency: price?.currency?.toUpperCase() ?? null,
    description: item.feature_bullets?.length ? item.feature_bullets.join("\n") : item.description ?? null,
    brand: item.brand ?? specs["Brand"] ?? null,
    category,
    size: specs["Size"] ?? specs["Size Name"] ?? null,
    weight: weightText,
    weight_lbs: weightLbs,
    dimensions,
    specifications: specs,
    seller: cleanString(bb?.fulfillment?.third_party_seller?.name) ?? (bb?.fulfillment?.is_sold_by_amazon === true ? "Amazon" : null),
    condition: conditionTitle ?? (bb?.condition?.is_new === true ? "New" : bb?.condition?.is_new === false ? "Used" : null),
    rating: parseRating(item.rating),
    review_count: parseReviewCount(item.ratings_total),
    images,
    variants: {},
    availability: cleanString(bb?.availability?.raw) ?? humanizeToken(bb?.availability?.type),
    metadata: {
      breadcrumbs: crumbs,
      images: rawImages,
      asin: item.asin ?? null,
      rating: item.rating ?? null,
      reviewCount: item.ratings_total != null ? `${item.ratings_total} ratings` : null,
      availability: item.buybox_winner?.availability?.type ?? null,
      condition: item.buybox_winner?.condition?.is_new === false ? "Used" : item.buybox_winner ? "New" : null,
      listPrice: item.buybox_winner?.rrp?.value ?? null,
      source: "rainforest",
    },
  };
}

/**
 * Tier 0 for Amazon — structured product data by ASIN, no browser. When it
 * answers with title + price the chain is done in a few seconds; the browser
 * tiers only run for stores it does not cover or when it fails.
 */
export const rainforestResolver: ExtractionResolver = {
  name: "rainforest",
  defaultConfidence: 0.95,
  needsHtml: false,
  startAfterMs: EXTRACTION.hedgeAfterMs,
  available: (ctx) => ctx.platform === "amazon" && isRainforestConfigured(),
  shouldRun: (ctx) => !hasRequiredFields(ctx.current),
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    const asin = amazonAsinOf(ctx.url);
    if (!asin) return { product: {} };
    if (ctx.deadline - Date.now() < 3_000) return { product: {} };
    try {
      const item = await fetchAmazonProduct(asin, amazonDomainOf(ctx.url));
      if (!item) return { product: {} };
      const product = mapRainforestProduct(item);
      const messages: string[] = [];
      if (product.price == null) {
        const availability = item.buybox_winner?.availability?.type;
        if (availability && availability !== "in_stock") messages.push(`Amazon lists this item as ${availability.replace(/_/g, " ")}.`);
      }
      return { product, messages };
    } catch (err) {
      logger.warn("rainforest resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
