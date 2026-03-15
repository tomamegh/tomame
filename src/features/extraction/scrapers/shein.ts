import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, SHEIN_CATEGORY_MAP } from "@/config/categories";

// ─── JSON-LD helpers ─────────────────────────────────────────────────

interface SheinProductGroup {
  name?: string;
  description?: string;
  url?: string;
  brand?: { name?: string } | string;
  productGroupID?: string;
  image?: string[];
  color?: string;
  variesBy?: string[];
  hasVariant?: SheinVariant[];
  aggregateRating?: { ratingValue?: string; reviewCount?: string };
}

interface SheinVariant {
  sku?: string;
  name?: string;
  image?: string[];
  offers?: { price?: string; priceCurrency?: string };
  size?: string;
}

interface SheinBreadcrumb {
  name?: string;
  item?: string;
}

/** Extract the BreadcrumbList from JSON-LD */
function extractBreadcrumbs($: CheerioAPI): string[] {
  const crumbs: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "");
      if (data?.["@type"] === "BreadcrumbList" && Array.isArray(data.itemListElement)) {
        for (const item of data.itemListElement as SheinBreadcrumb[]) {
          const name = item.name?.trim();
          if (name && name.toLowerCase() !== "home") crumbs.push(name);
        }
      }
    } catch {
      /* ignore */
    }
  });

  return crumbs;
}

/** Extract the ProductGroup from JSON-LD (Shein wraps it in an array) */
function extractProductGroup($: CheerioAPI): SheinProductGroup | null {
  let product: SheinProductGroup | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (product) return;
    try {
      const data = JSON.parse($(el).html() ?? "");
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item?.["@type"] === "ProductGroup" || item?.["@type"] === "Product") {
          product = item as SheinProductGroup;
          return;
        }
      }
    } catch {
      /* ignore */
    }
  });

  return product;
}

/** Extract cat_id / cate_name from inline scripts */
function extractCategoryFromScripts($: CheerioAPI): string | null {
  let cateName: string | null = null;

  $("script").each((_, el) => {
    if (cateName) return;
    const text = $(el).html() ?? "";
    const match = text.match(/"cate_name":"([^"]+)"/);
    if (match?.[1]) cateName = match[1];
  });

  return cateName;
}

/** Map category using breadcrumbs and inline script cate_name */
function mapCategory(breadcrumbs: string[], cateName: string | null): TomameCategory | null {
  // Try inline script cate_name first (most specific)
  if (cateName) {
    const mapped = SHEIN_CATEGORY_MAP.get(cateName);
    if (mapped) return mapped;
  }

  // Walk breadcrumbs from most specific to least
  for (let i = breadcrumbs.length - 1; i >= 0; i--) {
    const crumb = breadcrumbs[i];
    if (!crumb) continue;
    const mapped = SHEIN_CATEGORY_MAP.get(crumb);
    if (mapped) return mapped;
  }

  return breadcrumbs.length > 0 ? TomameCategory.OTHER : null;
}

// ─── DOM helpers ─────────────────────────────────────────────────────

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim();
  return t || null;
}

function extractPriceDom($: CheerioAPI): { price: number | null; currency: string | null } {
  const priceText = text($, ".floor-price, .productFloorPrice, [class*='original-price']");
  if (!priceText) return { price: null, currency: null };

  const match = priceText.match(/\$\s*([\d,]+\.?\d*)/);
  if (match?.[1]) {
    return { price: parseFloat(match[1].replace(/,/g, "")), currency: "USD" };
  }
  return { price: null, currency: null };
}

function extractColorFromDom($: CheerioAPI): string | null {
  // Active color swatch aria-label
  const active = $(".bs-color__item.active").attr("aria-label");
  if (active) return active;

  // Color title elements
  const titleColor = $(".bs-color__item.active").find("img").attr("alt");
  if (titleColor) return titleColor;

  return null;
}

function extractSizeFromDom($: CheerioAPI): string | null {
  const selected = $(".goods-size__item.active, .bs-size__item.active").text().trim();
  return selected || null;
}

function extractAvailableSizes($: CheerioAPI): string[] {
  const sizes: string[] = [];
  $(".goods-size__item, .bs-size__item").each((_, el) => {
    const val = $(el).text().trim();
    if (val) sizes.push(val);
  });

  // Fallback: parse from size section text
  if (sizes.length === 0) {
    const sizeText = $(".goods-size__wrapper").text();
    const matches = sizeText.match(/\d+\s*\([A-Z]+\)/g);
    if (matches) return matches.map((m) => m.trim());
  }

  return sizes;
}

// ─── Scraper class ───────────────────────────────────────────────────

export class SheinScraper extends PlatformScraper {
  public readonly domains = ["shein.com", "m.shein.com"];

  public async scrape(url: string): Promise<ScrapedProduct> {
    const result = await this.browserless.scrapeContent({
      url,
      waitForSelector: "h1, .product-intro__head-name, .goods-detail__title, title",
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
    const productGroup = extractProductGroup($);
    const breadcrumbs = extractBreadcrumbs($);
    const cateName = extractCategoryFromScripts($);

    // ── Title ──
    const title =
      productGroup?.name ??
      $('meta[property="og:title"]').attr("content") ??
      text($, "h1");

    // ── Price / Currency ──
    let price: number | null = null;
    let currency: string | null = "USD";

    // Use first variant offer from JSON-LD
    const firstVariant = productGroup?.hasVariant?.[0];
    if (firstVariant?.offers?.price) {
      price = parseFloat(firstVariant.offers.price);
      currency = firstVariant.offers.priceCurrency ?? "USD";
    }

    // Fallback to DOM
    if (price == null) {
      const domPrice = extractPriceDom($);
      price = domPrice.price;
      currency = domPrice.currency;
    }

    // ── Images ──
    const allImages = productGroup?.image ?? [];
    const mainImage =
      allImages[0] ??
      $('meta[property="og:image"]').attr("content") ??
      null;

    // ── Brand ──
    let brand: string | null = null;
    if (typeof productGroup?.brand === "string") {
      brand = productGroup.brand;
    } else if (typeof productGroup?.brand === "object" && productGroup.brand?.name) {
      brand = productGroup.brand.name;
    }

    // ── Description ──
    const description =
      productGroup?.description ??
      $('meta[property="og:description"]').attr("content") ??
      null;

    // ── Category ──
    // Remove the product name itself from breadcrumbs (last item is always the product)
    const categoryBreadcrumbs = breadcrumbs.slice(0, -1);
    const category = mapCategory(categoryBreadcrumbs, cateName);

    // ── Color ──
    const color = productGroup?.color ?? extractColorFromDom($) ?? null;

    // ── Size ──
    const size = firstVariant?.size ?? extractSizeFromDom($) ?? null;

    // ── Available sizes ──
    const availableSizes =
      productGroup?.hasVariant
        ?.map((v) => v.size)
        .filter((s): s is string => !!s) ?? extractAvailableSizes($);

    // ── Rating ──
    const rating = productGroup?.aggregateRating?.ratingValue ?? null;
    const reviewCount = productGroup?.aggregateRating?.reviewCount ?? null;

    return {
      title,
      image: mainImage,
      price,
      currency,
      description,
      brand,
      category,
      color,
      size,
      weight: null,
      dimensions: null,
      specifications: {},
      metadata: {
        images: allImages,
        availableSizes,
        productGroupID: productGroup?.productGroupID ?? null,
        sku: firstVariant?.sku ?? null,
        rating,
        reviewCount,
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const sheinScraper = new SheinScraper(browserlessClient);
