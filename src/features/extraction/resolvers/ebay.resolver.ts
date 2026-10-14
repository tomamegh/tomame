import { logger } from "@/lib/logger";
import { EBAY_CATEGORY_MAP, type TomameCategory } from "@/config/categories";
import { fetchEbayItem, type EbayItem, type EbayShippingOption } from "@/lib/ebay/browse";
import { isEbayConfigured } from "@/lib/ebay/config";
import { hubDestinationFor } from "../hub-destination";
import { cleanSpecValue, dimensionsFromSpecs, weightFromSpecs } from "../weight";
import { ebayItemIdOf, ebayVariantIdOf } from "../url";
import { cleanString, cleanTitle, normalizeImages, salePrice } from "../scrapers/parse";
import type { StoreShippingOption } from "../store-shipping";
import { hasRequiredFields } from "./merge";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

/** The store's own word on the listing outranks every scrape of it. */
export const EBAY_CONFIDENCE = 0.96;

function money(m: { value?: string; currency?: string } | undefined): { value: number | null; currency: string | null } {
  const value = m?.value != null ? parseFloat(m.value) : NaN;
  return { value: Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null, currency: m?.currency?.toUpperCase() ?? null };
}

function shippingLabel(o: EbayShippingOption): string {
  const type = cleanString(o.type) ?? cleanString(o.shippingServiceCode) ?? "Shipping";
  const carrier = cleanString(o.shippingCarrierCode);
  return carrier && !type.toLowerCase().includes(carrier.toLowerCase()) ? `${carrier} ${type}` : type;
}

/** The services a listing offers to the hub, cheapest first. Only ones with a stated cost count. */
export function mapEbayShippingOptions(item: EbayItem): StoreShippingOption[] {
  const out: StoreShippingOption[] = [];
  for (const o of item.shippingOptions ?? []) {
    const cost = money(o.shippingCost);
    if (cost.value == null) continue;
    const code = cleanString(o.shippingServiceCode) ?? cleanString(o.type);
    if (!code) continue;
    if (out.some((x) => x.code === code)) continue;
    out.push({
      code: code.slice(0, 80),
      label: shippingLabel(o),
      cost: cost.value,
      currency: cost.currency ?? item.price?.currency?.toUpperCase() ?? "USD",
      eta_min: o.minEstimatedDeliveryDate ?? null,
      eta_max: o.maxEstimatedDeliveryDate ?? null,
    });
  }
  return out.sort((a, b) => a.cost - b.cost);
}

function categoryOf(path: string | undefined): { category: TomameCategory | null; breadcrumbs: string[] } {
  const breadcrumbs = (path ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  // Most specific first: "USB Cables, Hubs & Adapters" before "Computers/Tablets & Networking".
  for (const crumb of [...breadcrumbs].reverse()) {
    const mapped = EBAY_CATEGORY_MAP.get(crumb);
    if (mapped) return { category: mapped, breadcrumbs };
  }
  return { category: null, breadcrumbs };
}

function availabilityOf(item: EbayItem): string | null {
  const status = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;
  if (!status) return null;
  if (status === "IN_STOCK") return "In Stock";
  if (status === "OUT_OF_STOCK") return "Out of stock";
  return status.replace(/_/g, " ").toLowerCase();
}

export function mapEbayItem(item: EbayItem, sourceUrl: string, shipTo: { country: string; zip: string | null }): PartialProduct {
  const specs: Record<string, string> = {};
  for (const a of item.localizedAspects ?? []) {
    const k = cleanSpecValue(a.name);
    const v = cleanSpecValue(a.value);
    if (k && v && !(k in specs)) specs[k] = v;
  }
  const price = money(item.price);
  const list = money(item.marketingPrice?.originalPrice);
  const sale = salePrice(price.value, list.value);
  const { category, breadcrumbs } = categoryOf(item.categoryPath);
  const weight = weightFromSpecs(specs);
  const images = normalizeImages([item.image?.imageUrl ?? null, ...(item.additionalImages ?? []).map((i) => i?.imageUrl ?? null)], item.image?.imageUrl ?? null);
  const options = mapEbayShippingOptions(item);
  const cheapest = options[0] ?? null;

  return {
    title: item.title ? cleanTitle(item.title) : null,
    image: images[0] ?? null,
    price: sale.price,
    currency: sale.price != null ? price.currency ?? "USD" : null,
    description: cleanString(item.shortDescription),
    brand: cleanString(item.brand) ?? specs["Brand"] ?? null,
    category,
    size: specs["Size"] ?? null,
    weight: weight.text,
    weight_lbs: weight.lbs,
    dimensions: dimensionsFromSpecs(specs),
    specifications: specs,
    seller: cleanString(item.seller?.username),
    condition: cleanString(item.condition),
    rating: null,
    review_count: null,
    images,
    variants: {},
    availability: availabilityOf(item),
    // Per unit, in the listing currency; the cheapest service the seller offers to the hub.
    store_shipping: cheapest ? cheapest.cost : null,
    metadata: {
      itemId: item.itemId ?? null,
      legacyItemId: item.legacyItemId ?? ebayItemIdOf(sourceUrl),
      ...(sale.listPrice != null ? { listPrice: sale.listPrice } : {}),
      priceSource: "ebay-api",
      breadcrumbs,
      images: images,
      condition: item.condition ?? null,
      seller: item.seller?.username ?? null,
      sellerFeedbackPct: item.seller?.feedbackPercentage ?? null,
      itemLocation: item.itemLocation ?? null,
      storeShippingOptions: options,
      storeShippingTo: shipTo,
      source: "ebay",
    },
  };
}

/**
 * eBay Browse API tier: the listing as eBay itself records it, with the
 * shipping services and costs to the hub. First for eBay; ScraperAPI's page
 * read hedges behind it (migration-free: the store plan orders them).
 */
export const ebayResolver: ExtractionResolver = {
  name: "ebay",
  defaultConfidence: EBAY_CONFIDENCE,
  needsHtml: false,
  available: (ctx) => ctx.platform === "ebay" && isEbayConfigured() && ebayItemIdOf(ctx.url) !== null,
  shouldRun: (ctx) => !hasRequiredFields(ctx.current) || ctx.current.store_shipping == null,
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (ctx.deadline - Date.now() < 2_000) return { product: {} };
    const legacyItemId = ebayItemIdOf(ctx.url);
    if (!legacyItemId) return { product: {} };
    try {
      const shipTo = await hubDestinationFor(ctx.region);
      const item = await fetchEbayItem(legacyItemId, {
        marketplace: ctx.region === "UK" ? "EBAY_GB" : "EBAY_US",
        shipTo,
        variantId: ebayVariantIdOf(ctx.url),
        signal: ctx.signal,
      });
      if (!item) return { product: {} };
      const product = mapEbayItem(item, ctx.url, shipTo);
      const messages: string[] = [];
      if (product.price == null && /out of stock/i.test(product.availability ?? "")) messages.push("The store lists this item as out of stock.");
      if (product.price != null && (product.metadata?.storeShippingOptions as unknown[]).length === 0) {
        messages.push("This seller does not ship to our hub. We can still try to source it for you.");
      }
      return { product, messages };
    } catch (err) {
      logger.warn("ebay resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
