import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, FASHIONNOVA_CATEGORY_MAP } from "@/config/categories";

// ─── JSON-LD types ───────────────────────────────────────────────────

interface JsonLdProduct {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  description?: string;
  brand?: { name?: string } | string;
  sku?: string;
  offers?:
    | { price?: number | string; priceCurrency?: string }
    | Array<{ price?: number | string; priceCurrency?: string }>;
  aggregateRating?: {
    ratingValue?: number | string;
    reviewCount?: number | string;
  };
}

interface JsonLdBreadcrumbItem {
  item?: { name?: string };
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
        if (item?.["@type"] === "Product") {
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
        for (const entry of data.itemListElement as JsonLdBreadcrumbItem[]) {
          // Fashion Nova uses { item: { name: "..." } } format
          const name = entry?.item?.name ?? entry?.name;
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
  return text($, "h1") ?? ($("title").text().trim().replace(/\s*\|.*$/, "") || null);
}

function extractPriceDom($: CheerioAPI): { price: number | null; currency: string | null } {
  // Fashion Nova uses divs with "contents" class for price
  let priceText = "";
  $('[class*="price"]').each((_, el) => {
    if (priceText) return;
    const t = $(el).text().trim();
    if (t.includes("$")) priceText = t;
  });

  if (!priceText) return { price: null, currency: null };

  const match = priceText.match(/\$\s*([\d,]+\.?\d*)/);
  if (match?.[1]) {
    return { price: parseFloat(match[1].replace(/,/g, "")), currency: "USD" };
  }
  return { price: null, currency: "USD" };
}

function extractImagesDom($: CheerioAPI): string[] {
  const images: string[] = [];

  // og:image meta tag
  const ogImage =
    $('meta[property="og:image:url"]').attr("content") ??
    $('meta[property="og:image"]').attr("content");
  if (ogImage) images.push(ogImage);

  return images;
}

/** Parse color from the product title (e.g. "Gracie Dress - Rust" → "Rust") */
function extractColorFromTitle(title: string | null): string | null {
  if (!title) return null;
  const match = title.match(/\s+-\s+(.+)$/);
  return match?.[1]?.trim() ?? null;
}

/** Parse available colors from description (e.g. "Available In Black, Plum, Rust And White.") */
function extractAvailableColors(description: string | null): string[] {
  if (!description) return [];
  const match = description.match(/Available\s+In\s+([^.]+)\./i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/,\s*|\s+And\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Parse material from description (e.g. "Shell: 98% Polyester 2% Spandex") */
function extractMaterial(description: string | null): string | null {
  if (!description) return null;
  // Look for material patterns
  const patterns = [
    /(?:Shell|Material|Fabric):\s*([^.]+)/i,
    /(\d+%\s+\w+(?:\s+\d+%\s+\w+)*)/,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function mapCategory(breadcrumbs: string[]): TomameCategory | null {
  // Search from most specific (last) to least specific, skip product name (last crumb)
  const categoryCrumbs = breadcrumbs.slice(0, -1);
  for (let i = categoryCrumbs.length - 1; i >= 0; i--) {
    const mapped = FASHIONNOVA_CATEGORY_MAP.get(categoryCrumbs[i]!);
    if (mapped) return mapped;
  }
  return categoryCrumbs.length > 0 ? TomameCategory.OTHER : null;
}

// ─── Scraper class ───────────────────────────────────────────────────

export class FashionNovaScraper extends PlatformScraper {
  public readonly domains = ["fashionnova.com"];

  public async scrape(url: string): Promise<ScrapedProduct> {
    const result = await this.browserless.scrapeContent({
      url,
      waitForSelector: "h1",
      stealth: true,
      timeout: 30000,
    });

    if (!result.success || !result.html) {
      throw new Error(result.error ?? "Failed to fetch page");
    }

    const $ = cheerio.load(result.html);
    return this.extract($);
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const jsonLd = extractJsonLdProduct($);

    // ── Title ──
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

    // ── Images ──
    const allImages: string[] = [];

    if (jsonLd?.image) {
      const ldImages = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
      for (const img of ldImages) {
        if (img && !allImages.includes(img)) allImages.push(img);
      }
    }
    for (const img of extractImagesDom($)) {
      if (!allImages.includes(img)) allImages.push(img);
    }

    const mainImage = allImages[0] ?? null;

    // ── Brand ──
    let brand: string | null = null;
    if (jsonLd?.brand) {
      brand = typeof jsonLd.brand === "string" ? jsonLd.brand : jsonLd.brand.name ?? null;
    }

    // ── Description ──
    const description = jsonLd?.description ?? null;

    // ── Category ──
    let breadcrumbs = extractJsonLdBreadcrumbs($);
    if (breadcrumbs.length === 0) {
      // Try DOM breadcrumbs
      $("nav.breadcrumbs a, .breadcrumb a").each((_, el) => {
        const t = $(el).text().trim();
        if (t && t.toLowerCase() !== "home") breadcrumbs.push(t);
      });
    }
    const category = mapCategory(breadcrumbs);

    // ── Color / Size ──
    const color = extractColorFromTitle(title);
    const availableColors = extractAvailableColors(description);

    // ── Material as spec ──
    const specifications: Record<string, string> = {};
    const material = extractMaterial(description);
    if (material) specifications["Material"] = material;

    // ── Rating ──
    const rating = jsonLd?.aggregateRating?.ratingValue?.toString() ?? null;
    const reviewCount = jsonLd?.aggregateRating?.reviewCount?.toString() ?? null;

    return {
      title,
      image: mainImage,
      price,
      currency,
      description,
      brand,
      category,
      color,
      size: null,
      weight: null,
      dimensions: null,
      specifications,
      metadata: {
        images: allImages,
        availableSizes: [],
        availableColors,
        sku: jsonLd?.sku ?? null,
        gtin: null,
        rating,
        reviewCount,
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const fashionNovaScraper = new FashionNovaScraper(browserlessClient);
