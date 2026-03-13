import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { scrapingBeeClient } from "@/lib/scrapingbee/client";
import { TomameCategory, COSTCO_CATEGORY_MAP } from "@/config/categories";

// ─── JSON-LD types ───────────────────────────────────────────────────

interface JsonLdProduct {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  description?: string;
  brand?: { name?: string } | string;
  sku?: string;
  gtin13?: string;
  url?: string;
  offers?:
    | { price?: number | string; priceCurrency?: string }
    | Array<{ price?: number | string; priceCurrency?: string }>;
  aggregateRating?: {
    ratingValue?: number | string;
    ratingCount?: number | string;
    reviewCount?: number | string;
  };
  category?: string;
}

interface JsonLdBreadcrumbItem {
  name?: string;
}

// ─── JSON-LD extraction ──────────────────────────────────────────────

function extractJsonLdProduct($: CheerioAPI): JsonLdProduct | null {
  let result: JsonLdProduct | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    try {
      const data = JSON.parse($(el).html() ?? "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.["@type"] === "Product" || item?.["@type"] === "IndividualProduct") {
          result = item as JsonLdProduct;
          return;
        }
        if (item?.["@graph"]) {
          for (const node of item["@graph"]) {
            if (node?.["@type"] === "Product") {
              result = node as JsonLdProduct;
              return;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  });

  return result;
}

function extractJsonLdBreadcrumbs($: CheerioAPI): string[] {
  const crumbs: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    if (crumbs.length > 0) return;
    try {
      const data = JSON.parse($(el).html() ?? "");
      if (data?.["@type"] === "BreadcrumbList" && Array.isArray(data.itemListElement)) {
        for (const item of data.itemListElement as JsonLdBreadcrumbItem[]) {
          const name = item?.name;
          if (name && name.toLowerCase() !== "home") {
            crumbs.push(name);
          }
        }
      }
    } catch {
      /* ignore */
    }
  });

  return crumbs;
}

// ─── DOM fallback helpers ────────────────────────────────────────────

function text($: CheerioAPI, selector: string): string | null {
  const t = $(selector).first().text().trim();
  return t || null;
}

function extractTitleDom($: CheerioAPI): string | null {
  return (
    text($, 'h1[automation-id="productName"]') ??
    text($, "h1.product-title") ??
    text($, "h1")
  );
}

function extractPriceDom($: CheerioAPI): { price: number | null; currency: string | null } {
  let priceText =
    text($, 'span[automation-id="productPriceOutput"]') ??
    text($, ".price") ??
    text($, '[id="pull-right-price"]');

  if (!priceText) return { price: null, currency: null };

  const match = priceText.match(/\$\s*([\d,]+\.?\d*)/);
  if (match?.[1]) {
    return { price: parseFloat(match[1].replace(/,/g, "")), currency: "USD" };
  }
  return { price: null, currency: "USD" };
}

function extractImagesDom($: CheerioAPI): string[] {
  const images: string[] = [];

  // Try og:image meta tag
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) images.push(ogImage);

  // Thumbnail carousel
  $("img.thumbnail-image, .product-image img, .gallery img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src");
    if (src && !images.includes(src)) images.push(src);
  });

  // Main image fallbacks
  const mainSelectors = [
    'img[automation-id="mainImage"]',
    ".product-image-holder img",
    '[id="RICHFXViewerContainer"] img',
  ];
  for (const sel of mainSelectors) {
    const src = $(sel).first().attr("src");
    if (src && !images.includes(src)) images.unshift(src);
  }

  return images;
}

function extractDescriptionDom($: CheerioAPI): string | null {
  const desc = $('[id="product-tab1-espotdetails"]');
  if (desc.length) return desc.text().trim() || null;
  return text($, ".product-info-description") ?? text($, '[itemprop="description"]');
}

function extractSpecifications($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  // Row-based specs (.spec-name / .spec-value)
  $(".product-info-description .row").each((_, el) => {
    const name = $(el).find(".spec-name, .attr-name").text().trim().replace(/:$/, "");
    const value = $(el).find(".spec-value, .attr-value").text().trim();
    if (name && value) specs[name] = value;
  });

  // Table-based specs
  $(".product-info table tr, .product-info-specs table tr").each((_, el) => {
    const cells = $(el).find("td, th");
    if (cells.length >= 2) {
      const key = cells.eq(0).text().trim().replace(/:$/, "");
      const val = cells.eq(1).text().trim();
      if (key && val && key !== val) specs[key] = val;
    }
  });

  // Feature bullets with "Key: Value" format
  $(".product-info-description li, .features-list li").each((_, el) => {
    const t = $(el).text().trim();
    const colonMatch = t.match(/^([^:]+):\s*(.+)/);
    if (colonMatch?.[1] && colonMatch?.[2]) {
      specs[colonMatch[1].trim()] = colonMatch[2].trim();
    }
  });

  return specs;
}

function extractBreadcrumbsDom($: CheerioAPI): string[] {
  const crumbs: string[] = [];
  $("nav.breadcrumb a, .breadcrumb a, ol.breadcrumb li a, [automation-id='breadcrumbs'] a").each(
    (_, el) => {
      const t = $(el).text().trim();
      if (t && t.toLowerCase() !== "home" && t.toLowerCase() !== "costco") crumbs.push(t);
    },
  );
  return crumbs;
}

function extractWeight(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/weight/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function extractDimensions(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/dimension/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function mapCategory(breadcrumbs: string[]): TomameCategory | null {
  // Search from most specific (last) to least specific (first)
  for (let i = breadcrumbs.length - 1; i >= 0; i--) {
    const mapped = COSTCO_CATEGORY_MAP.get(breadcrumbs[i]!);
    if (mapped) return mapped;
  }
  return breadcrumbs.length > 0 ? TomameCategory.OTHER : null;
}

// ─── Scraper class ───────────────────────────────────────────────────

export class CostcoScraper extends PlatformScraper {
  public readonly domains = ["costco.com"];

  public async scrape(url: string): Promise<ScrapedProduct> {
    // Costco uses Akamai bot protection — use ScrapingBee with premium
    // proxies as primary, fall back to browserless /unblock.
    let result = await scrapingBeeClient.scrape({
      url,
      premiumProxy: true,
      wait: 3000,
      timeout: 45000,
    });

    // Fall back to browserless /unblock if ScrapingBee fails
    if (!result.success || !result.html || result.html.includes("Access Denied")) {
      result = await this.browserless.unblock({
        url,
        timeout: 60000,
        residentialProxy: true,
      });
    }

    if (!result.success || !result.html) {
      throw new Error(result.error ?? "Failed to fetch page — Costco bot protection may be active");
    }

    if (result.html.includes("Access Denied")) {
      throw new Error("Costco blocked the request (Akamai bot protection)");
    }

    const $ = cheerio.load(result.html);
    return this.extract($);
  }

  public extract($: CheerioAPI): ScrapedProduct {
    // Costco's current site puts all product data in JSON-LD — use that
    // as the primary source with DOM selectors as fallbacks.
    const jsonLd = extractJsonLdProduct($);
    const specifications = extractSpecifications($);

    // ── Title (JSON-LD primary, DOM fallback) ──
    const title = jsonLd?.name ?? extractTitleDom($);

    // ── Price / Currency ──
    let price: number | null = null;
    let currency: string | null = "USD";

    if (jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer?.price != null) {
        price = typeof offer.price === "string" ? parseFloat(offer.price) : offer.price;
        currency = offer.priceCurrency ?? "USD";
      }
    }
    if (price == null) {
      const domPrice = extractPriceDom($);
      price = domPrice.price;
      currency = domPrice.currency ?? "USD";
    }

    // ── Images (JSON-LD primary, DOM + og:image fallback) ──
    const allImages: string[] = [];

    if (jsonLd?.image) {
      const ldImages = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
      for (const img of ldImages) {
        if (img && !allImages.includes(img)) allImages.push(img);
      }
    }

    const domImages = extractImagesDom($);
    for (const img of domImages) {
      if (!allImages.includes(img)) allImages.push(img);
    }

    const mainImage = allImages[0] ?? null;

    // ── Brand ──
    let brand: string | null = null;
    if (jsonLd?.brand) {
      brand = typeof jsonLd.brand === "string" ? jsonLd.brand : jsonLd.brand.name ?? null;
    }
    if (!brand) {
      brand =
        text($, '[itemprop="brand"]') ??
        text($, ".product-brand") ??
        text($, 'span[automation-id="productBrand"]');
    }

    // ── Description ──
    const description = jsonLd?.description ?? extractDescriptionDom($);

    // ── Category (JSON-LD BreadcrumbList primary, DOM fallback) ──
    let breadcrumbs = extractJsonLdBreadcrumbs($);
    if (breadcrumbs.length === 0) {
      breadcrumbs = extractBreadcrumbsDom($);
    }
    const category = mapCategory(breadcrumbs);

    // ── Rating ──
    const rating = jsonLd?.aggregateRating?.ratingValue?.toString() ??
      ($('[itemprop="ratingValue"]').text().trim() || $('[itemprop="ratingValue"]').attr("content")) ??
      null;

    const reviewCount = (
      jsonLd?.aggregateRating?.reviewCount ??
      jsonLd?.aggregateRating?.ratingCount
    )?.toString() ??
      ($('[itemprop="reviewCount"]').text().trim() || $('[itemprop="reviewCount"]').attr("content")) ??
      null;

    // ── SKU / Item Number ──
    const sku = jsonLd?.sku ??
      text($, '[automation-id="itemNumber"]') ??
      text($, ".item-number");

    return {
      title,
      image: mainImage,
      price,
      currency,
      description,
      brand,
      category,
      color: null,
      size: null,
      weight: extractWeight(specifications),
      dimensions: extractDimensions(specifications),
      specifications,
      metadata: {
        images: allImages,
        availableSizes: [],
        sku: sku ?? null,
        gtin: jsonLd?.gtin13 ?? null,
        rating,
        reviewCount,
        itemNumber: sku ?? null,
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const costcoScraper = new CostcoScraper(browserlessClient);
