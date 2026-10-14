import { logger } from "@/lib/logger";
import { fetchShopifyProduct, shopifyHandleOf, shopifyVariantIdOf, type ShopifyProduct } from "@/lib/shopify/client";
import { hasRequiredFields } from "./merge";
import { addVariant, cleanTitle, normalizeImages, salePrice } from "../scrapers/parse";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

/** The store's own product record: above every vendor's read of its page. */
export const SHOPIFY_CONFIDENCE = 0.95;

function pickVariant(product: ShopifyProduct, variantId: number | null): ShopifyProduct["variants"][number] | null {
  if (product.variants.length === 0) return null;
  if (variantId != null) {
    const exact = product.variants.find((v) => v.id === variantId);
    if (exact) return exact;
  }
  return product.variants.find((v) => v.available !== false && v.price != null) ?? product.variants[0] ?? null;
}

export function mapShopifyProduct(product: ShopifyProduct, sourceUrl: string, fallbackCurrency: string): PartialProduct {
  const variant = pickVariant(product, shopifyVariantIdOf(sourceUrl));
  const sale = salePrice(variant?.price ?? null, variant?.compare_at_price ?? null);
  const currency = sale.price != null ? variant?.currency ?? fallbackCurrency : null;
  const images = normalizeImages(product.images);
  const grams = variant?.grams != null && variant.grams > 0 ? variant.grams : null;
  const weightLbs = grams != null ? Math.max(Math.round((grams / 453.592) * 100) / 100, 0.01) : null;

  const specs: Record<string, string> = {};
  const variants: Record<string, string[]> = {};
  product.options.forEach((o, i) => {
    const key = o.name.toLowerCase() === "title" ? null : o.name;
    if (!key) return;
    const chosen = variant?.options[i];
    if (chosen) specs[key] = chosen;
    for (const value of o.values) addVariant(variants, key, value);
  });
  if (product.vendor) specs["Brand"] = product.vendor;

  const availability = variant?.available == null ? null : variant.available ? "In Stock" : "Out of stock";
  const sizeKey = Object.keys(specs).find((k) => /size/i.test(k));

  return {
    title: cleanTitle(product.title),
    image: images[0] ?? null,
    price: sale.price,
    currency,
    description: product.description_html ? product.description_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000) || null : null,
    brand: product.vendor,
    category: null,
    size: sizeKey ? specs[sizeKey] ?? null : null,
    weight: grams != null ? `${grams} g` : null,
    weight_lbs: weightLbs,
    dimensions: null,
    specifications: specs,
    seller: null,
    condition: null,
    rating: null,
    review_count: null,
    images,
    variants,
    availability,
    store_shipping: null,
    metadata: {
      shopifyProductId: product.id,
      shopifyVariantId: variant?.id ?? null,
      sku: variant?.sku ?? null,
      ...(sale.listPrice != null ? { listPrice: sale.listPrice } : {}),
      priceSource: "shopify",
      // The classifier reads these: Shopify's product type and tags are the store's own taxonomy.
      categoryText: product.product_type,
      breadcrumbs: [product.product_type, ...product.tags.slice(0, 8)].filter((s): s is string => !!s),
      images,
      source: "shopify",
    },
  };
}

/**
 * Shopify storefront tier: a store's own product JSON, read before any vendor
 * for every store without a scraper of its own. A store that is not Shopify
 * (or has the endpoint off) answers in a few hundred milliseconds and the
 * vendor tiers start at once.
 */
export const shopifyResolver: ExtractionResolver = {
  name: "shopify",
  defaultConfidence: SHOPIFY_CONFIDENCE,
  needsHtml: false,
  available: (ctx) => shopifyHandleOf(ctx.url) !== null,
  shouldRun: (ctx) => !hasRequiredFields(ctx.current),
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (ctx.deadline - Date.now() < 2_000) return { product: {} };
    try {
      const product = await fetchShopifyProduct(ctx.url, { signal: ctx.signal });
      if (!product) return { product: {} };
      const mapped = mapShopifyProduct(product, ctx.url, ctx.store.currency);
      const messages: string[] = [];
      if (mapped.price == null && mapped.availability === "Out of stock") messages.push("The store lists this item as out of stock.");
      return { product: mapped, messages };
    } catch (err) {
      logger.warn("shopify resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
