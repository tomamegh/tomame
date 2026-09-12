import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import {
  fetchAmazonProductStructured,
  fetchEbayProductStructured,
  isScraperApiConfigured,
  type ScraperApiAmazonProduct,
  type ScraperApiEbayProduct,
} from "@/lib/scraperapi/client";
import { TomameCategory, AMAZON_CATEGORY_MAP, EBAY_CATEGORY_MAP } from "@/config/categories";
import { parseWeight } from "@/features/pricing/services/weight-parser";
import { amazonAsinOf, amazonDomainOf, defaultCurrencyForUrl, ebayItemIdOf } from "../url";
import { cleanString, normalizeImages, parseRating, parseReviewCount } from "../scrapers/parse";
import { hasRequiredFields } from "./merge";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

const SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "¥": "CNY" };

/**
 * ScraperAPI's eBay currency field is scraped text — "USD", "US $", "US $or Best Offer",
 * "GBP", "C $" have all been seen. Reduce it to an ISO code or the store default.
 */
export function normalizeCurrency(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const code = raw.toUpperCase().match(/\b(USD|GBP|EUR|CNY|CAD|AUD|JPY)\b/)?.[1];
  if (code) return code;
  const t = raw.replace(/\s+/g, "").toUpperCase();
  if (t.startsWith("US$") || t.startsWith("$")) return "USD";
  if (t.startsWith("C$") || t.startsWith("CA$")) return "CAD";
  if (t.startsWith("AU$")) return "AUD";
  if (t.startsWith("£")) return "GBP";
  if (t.startsWith("€")) return "EUR";
  if (t.startsWith("¥")) return "CNY";
  return fallback;
}

/** "$80.74" / "£1,299.00" → { price, currency }. */
export function parseMoney(text: string | null | undefined, fallbackCurrency: string): { price: number | null; currency: string | null } {
  if (!text) return { price: null, currency: null };
  const m = text.match(/(US\$|[£$€¥])?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m?.[2]) return { price: null, currency: null };
  const price = parseFloat(m[2].replace(/,/g, ""));
  if (!Number.isFinite(price) || price <= 0) return { price: null, currency: null };
  const symbol = m[1]?.replace("US$", "$");
  return { price, currency: (symbol && SYMBOL_CURRENCY[symbol]) || fallbackCurrency };
}

/** "Visit the Homall Store" / "Brand: Homall" → "Homall". */
function cleanBrand(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^(?:Visit the |Brand:\s*)(.+?)(?:\s+Store)?$/i);
  return (m?.[1] ?? raw).trim() || null;
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function mapScraperApiAmazon(item: ScraperApiAmazonProduct, sourceUrl: string): PartialProduct {
  const info = item.product_information ?? {};
  const specs: Record<string, string> = {};
  for (const [k, v] of Object.entries(info)) {
    if (k && v && typeof v === "string") specs[humanizeKey(k)] = v;
  }

  const crumbs = (item.product_category ?? "").split("›").map((c) => c.trim()).filter(Boolean);
  let category: TomameCategory | null = null;
  for (const c of crumbs) {
    const mapped = AMAZON_CATEGORY_MAP.get(c);
    if (mapped) {
      category = mapped;
      break;
    }
  }
  if (!category && crumbs.length > 0) category = TomameCategory.OTHER;

  const { price, currency } = parseMoney(item.pricing, defaultCurrencyForUrl(sourceUrl));
  const rawImages = item.high_res_images?.length ? item.high_res_images : item.images ?? [];
  const images = normalizeImages(rawImages);
  const weightText = info.item_weight ?? null;

  return {
    title: item.name ?? null,
    image: images[0] ?? null,
    price,
    currency,
    description: item.feature_bullets?.length ? item.feature_bullets.join("\n") : item.full_description ?? null,
    brand: cleanBrand(item.brand) ?? info.brand_name ?? null,
    category,
    size: info.size ?? null,
    weight: weightText,
    weight_lbs: parseWeight(weightText),
    dimensions: info.item_dimensions_d_x_w_x_h ?? info.item_dimensions ?? info.product_dimensions ?? null,
    specifications: specs,
    seller: cleanString(item.sold_by),
    condition: null, // the Amazon structured record does not state condition
    rating: parseRating(item.average_rating),
    review_count: parseReviewCount(item.total_reviews),
    images,
    variants: {},
    availability: cleanString(item.availability_status),
    metadata: {
      images: rawImages,
      breadcrumbs: crumbs,
      asin: info.asin ?? amazonAsinOf(sourceUrl),
      rating: item.average_rating ?? null,
      reviewCount: item.total_reviews != null ? `${item.total_reviews} reviews` : null,
      availability: item.availability_status ?? null,
      listPrice: parseMoney(item.list_price, defaultCurrencyForUrl(sourceUrl)).price,
      soldBy: item.sold_by ?? null,
      source: "scraperapi",
    },
  };
}

export function mapScraperApiEbay(item: ScraperApiEbayProduct, sourceUrl: string): PartialProduct {
  const specs: Record<string, string> = {};
  for (const s of item.item_specifics ?? []) {
    if (s?.label && s?.value && s.label !== "Seller Notes") specs[s.label] = s.value;
  }
  if (item.model && !specs["Model"]) specs["Model"] = item.model;
  if (item.color && !specs["Color"]) specs["Color"] = item.color;

  // The eBay endpoint carries no category path; item specifics sometimes name one.
  let category: TomameCategory | null = null;
  for (const key of ["Type", "Category", "Department"]) {
    const v = specs[key];
    const mapped = v ? EBAY_CATEGORY_MAP.get(v) : undefined;
    if (mapped) {
      category = mapped;
      break;
    }
  }

  const weightText = Object.entries(specs).find(([k]) => /\bweight\b/i.test(k))?.[1] ?? null;
  const price = typeof item.price?.value === "number" && item.price.value > 0 ? item.price.value : null;
  const images = normalizeImages(item.images ?? []);

  return {
    title: item.title ?? null,
    image: images[0] ?? null,
    price,
    currency: price != null ? normalizeCurrency(item.price?.currency, defaultCurrencyForUrl(sourceUrl)) : null,
    description: null,
    brand: item.brand ?? specs["Brand"] ?? null,
    category,
    size: specs["Size"] ?? null,
    weight: weightText,
    weight_lbs: parseWeight(weightText),
    dimensions: Object.entries(specs).find(([k]) => /dimension|item (length|height|width)/i.test(k))?.[1] ?? null,
    specifications: specs,
    seller: cleanString(item.seller?.name),
    condition: cleanString(item.condition),
    rating: parseRating(item.rating),
    review_count: parseReviewCount(item.review_count),
    images,
    variants: {},
    // `available` is a boolean, not a store phrase; the resolver adds a message when it is false.
    availability: null,
    metadata: {
      images: item.images ?? [],
      itemId: item.product_id_epid ?? ebayItemIdOf(sourceUrl),
      condition: item.condition ?? null,
      seller: item.seller?.name ?? null,
      available: item.available ?? null,
      shippingCost: item.shipping_costs?.value ?? null,
      rating: item.rating ?? null,
      reviewCount: item.review_count != null ? `${item.review_count} reviews` : null,
      source: "scraperapi",
    },
  };
}

function marketplace(url: string): { tld: string; country: string } {
  const domain = amazonDomainOf(url); // amazon.com | amazon.co.uk
  const tld = domain.replace(/^amazon\./, "");
  const country = tld === "com" ? "us" : tld === "co.uk" ? "uk" : tld.split(".").pop() ?? "us";
  return { tld, country };
}

/**
 * Tier 0 for Amazon and eBay — structured product JSON in a few seconds, no
 * browser. The browser tiers remain the fallback and cover the other stores.
 */
export const scraperApiResolver: ExtractionResolver = {
  name: "scraperapi",
  defaultConfidence: 0.95,
  needsHtml: false,
  startAfterMs: EXTRACTION.hedgeAfterMs,
  available: (ctx) => isScraperApiConfigured() && (ctx.platform === "amazon" || ctx.platform === "ebay"),
  shouldRun: (ctx) => !hasRequiredFields(ctx.current),
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (ctx.deadline - Date.now() < 3_000) return { product: {} };
    try {
      if (ctx.platform === "amazon") {
        const asin = amazonAsinOf(ctx.url);
        if (!asin) return { product: {} };
        const { tld, country } = marketplace(ctx.url);
        const item = await fetchAmazonProductStructured(asin, tld, country);
        if (!item) return { product: {} };
        const product = mapScraperApiAmazon(item, ctx.url);
        const messages: string[] = [];
        if (product.price == null && item.availability_status && !/in stock/i.test(item.availability_status)) {
          messages.push(`Amazon lists this item as "${item.availability_status}".`);
        }
        return { product, messages };
      }
      const itemId = ebayItemIdOf(ctx.url);
      if (!itemId) return { product: {} };
      const item = await fetchEbayProductStructured(itemId, ctx.region === "UK" ? "uk" : "us");
      if (!item) return { product: {} };
      const product = mapScraperApiEbay(item, ctx.url);
      const messages: string[] = [];
      if (item.available === false) messages.push("This eBay listing is no longer available.");
      return { product, messages };
    } catch (err) {
      logger.warn("scraperapi resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
