import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { fetchZyteProduct, isZyteConfigured, type ZyteProduct } from "@/lib/zyte/client";
import { dimensionsFromSpecs, weightFromSpecs } from "../weight";
import { hasRequiredFields } from "./merge";
import { addVariant, cleanTitle, normalizeImages, parseAggregateRating, parseSchemaAvailability, salePrice } from "../scrapers/parse";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";
import * as cheerio from "cheerio";
import { PAGE_OFFER_CONFIDENCE, extractFromJsonLd, parseJsonLd } from "./structured-data.resolver";

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

/** The page's own JSON-LD offer for this url, or null when the page has none that belongs to it. */
function pageOffer(html: string, url: string): PartialProduct | null {
  try {
    const ld = extractFromJsonLd(parseJsonLd(cheerio.load(html)), url);
    return ld.metadata?.offerUrlMatched ? ld : null;
  } catch (err) {
    logger.warn("zyte: page offer parse failed", { url, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function mapZyteProduct(item: ZyteProduct, fallbackCurrency: string): PartialProduct {
  const specs: Record<string, string> = {};
  for (const p of item.additionalProperties ?? []) {
    if (p?.name && p?.value) specs[p.name.replace(/\b\w/g, (c) => c.toUpperCase())] = p.value;
  }
  const breadcrumbs = (item.breadcrumbs ?? []).map((b) => b?.name?.trim()).filter((n): n is string => !!n);

  // `price` is the current price; `regularPrice` is the strike-through. An
  // out-of-stock item often carries only regularPrice — we never quote that.
  // A strike-through BELOW the current price is the two swapped: Zyte read
  // Fashion Nova's sale pages as price 64.99 / regular 44.99 while the page's
  // own offer said 44.99 (2026-10-01), so customers paid the pre-sale price.
  // The customer pays what the store charges, which is the lower one.
  const { price, listPrice } = salePrice(num(item.price), num(item.regularPrice));
  const currency = price == null ? null : item.currency?.toUpperCase() ?? (item.currencyRaw ? SYMBOL_CURRENCY[item.currencyRaw] : undefined) ?? fallbackCurrency;
  const weight = weightFromSpecs(specs);
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
    weight: weight.text,
    weight_lbs: weight.lbs,
    dimensions: dimensionsFromSpecs(specs),
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
      listPrice,
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
      const item = await fetchZyteProduct(ctx.url, { signal: ctx.signal, geolocation: ctx.region === "UK" ? "GB" : "US", withPage: true });
      if (!item) return { product: {} };
      const product = mapZyteProduct(item, ctx.scraper.defaultCurrency);
      const messages: string[] = [];
      if (product.price == null && item.availability && /outofstock|discontinued/i.test(item.availability)) {
        messages.push("The store lists this item as out of stock.");
      }
      const confidence: ResolverResult["confidence"] = {};
      if (item.pageHtml) {
        // The page's own offer for THIS url beats the AI's pick: LG lists every
        // size as a Product node and Zyte read the 85-inch price for the 43-inch
        // page (2026-10-12).
        const own = pageOffer(item.pageHtml, ctx.url);
        if (own && own.price != null && (own.price !== product.price || (own.currency && own.currency !== product.currency))) {
          logger.info("zyte: page offer overrides AI price", { url: ctx.url, ai: product.price, page: own.price, currency: own.currency ?? product.currency });
          product.price = own.price;
          if (own.currency) product.currency = own.currency;
          product.metadata = { ...(product.metadata ?? {}), listPrice: own.metadata?.listPrice ?? null, priceSource: "page-offer" };
        }
        if (own?.price != null) {
          confidence.price = PAGE_OFFER_CONFIDENCE;
          confidence.currency = PAGE_OFFER_CONFIDENCE;
        }
        // The page is already in hand: the free parsers can read it now rather
        // than wait on (or pay for) a second fetch.
        if (ctx.offerHtml && ctx.scraper.looksLikeProductPage(item.pageHtml)) ctx.offerHtml(item.pageHtml, "zyte");
      }
      return { product, messages, confidence };
    } catch (err) {
      logger.warn("zyte resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
