import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, WALMART_CATEGORY_MAP } from "@/config/categories";

// ─── JSON-LD / __NEXT_DATA__ helpers ────────────────────────────────

interface WalmartProductData {
  name?: string;
  image?: string | string[];
  brand?: { name?: string } | string;
  description?: string;
  offers?: { price?: number | string; priceCurrency?: string };
  color?: string;
  category?: string;
  sku?: string;
  gtin13?: string;
  aggregateRating?: { ratingValue?: string; reviewCount?: string };
}

interface WalmartNextData {
  props?: {
    pageProps?: {
      initialData?: {
        data?: {
          product?: {
            name?: string;
            brand?: string;
            shortDescription?: string;
            detailedDescription?: string;
            priceInfo?: { currentPrice?: { price?: number; currencyUnit?: string } };
            imageInfo?: { allImages?: Array<{ url?: string }> };
            fulfillmentBadge?: string;
            category?: { path?: Array<{ name?: string }> };
            variantCriteria?: Array<{
              name?: string;
              selectedValue?: string;
              variantList?: Array<{ name?: string }>;
            }>;
            idmlMap?: Record<string, string>;
          };
        };
      };
    };
  };
}

/** Extract the first JSON-LD Product block from <script type="application/ld+json"> */
function extractJsonLd($: CheerioAPI): WalmartProductData | null {
  let product: WalmartProductData | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (product) return;
    try {
      const data = JSON.parse($(el).html() ?? "");
      // Could be a single object or an array (e.g. @graph)
      const candidates = Array.isArray(data) ? data : data?.["@graph"] ?? [data];
      for (const item of candidates) {
        if (item?.["@type"] === "Product" || item?.name) {
          product = item as WalmartProductData;
          return;
        }
      }
    } catch {
      /* ignore invalid JSON */
    }
  });

  return product;
}

/** Extract __NEXT_DATA__ from the page (Walmart uses Next.js) */
function extractNextData($: CheerioAPI): WalmartNextData | null {
  const scriptEl = $("#__NEXT_DATA__");
  if (!scriptEl.length) return null;

  try {
    return JSON.parse(scriptEl.html() ?? "") as WalmartNextData;
  } catch {
    return null;
  }
}

// ─── DOM-based fallback helpers ─────────────────────────────────────

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim();
  return t || null;
}

function extractTitleDom($: CheerioAPI): string | null {
  return (
    text($, "[itemprop='name']") ??
    text($, "h1.prod-ProductTitle") ??
    text($, "h1[data-testid='product-title']") ??
    text($, "h1")
  );
}

function extractPriceDom($: CheerioAPI): { price: number | null; currency: string | null } {
  const priceText =
    text($, "[itemprop='price']") ??
    text($, "[data-testid='price-wrap'] [aria-hidden='true']") ??
    text($, ".price-characteristic");

  if (!priceText) return { price: null, currency: null };

  const match = priceText.match(/\$\s*([\d,]+\.?\d*)/);
  if (match?.[1]) {
    return { price: parseFloat(match[1].replace(/,/g, "")), currency: "USD" };
  }

  const numMatch = priceText.match(/([\d,]+\.?\d*)/);
  return {
    price: numMatch?.[1] ? parseFloat(numMatch[1].replace(/,/g, "")) : null,
    currency: "USD",
  };
}

function extractMainImageDom($: CheerioAPI): string | null {
  const img =
    $("[data-testid='hero-image'] img").attr("src") ??
    $(".prod-HeroImage img").attr("src") ??
    $("[itemprop='image']").attr("src") ??
    $("[itemprop='image']").attr("content");
  return img ?? null;
}

function extractAllImages($: CheerioAPI): string[] {
  const images: string[] = [];

  // Carousel thumbnails
  $("[data-testid='media-thumbnail'] img, .prod-alt-image-carousel img").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      // Upscale thumbnail to large
      const large = src.replace(/\/\d+x\d+/, "/612x612");
      if (!images.includes(large)) images.push(large);
    }
  });

  return images;
}

function extractSpecificationsDom($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  // Specifications table
  $(".product-specifications table tr, [data-testid='product-specifications'] tr").each((_, el) => {
    const key = $(el).find("td:first-child").text().trim();
    const value = $(el).find("td:last-child").text().trim();
    if (key && value && key !== value) specs[key] = value;
  });

  // Key-value list pattern
  $("[data-testid='specification'] .specification-row, .prod-Specifications .spec-row").each(
    (_, el) => {
      const key = $(el).find(".spec-name, .label").text().trim();
      const value = $(el).find(".spec-value, .value").text().trim();
      if (key && value) specs[key] = value;
    },
  );

  return specs;
}

function extractDescriptionDom($: CheerioAPI): string | null {
  return (
    text($, "[data-testid='product-description'] .dangerous-html") ??
    text($, ".about-product-description") ??
    text($, "[itemprop='description']")
  );
}

function extractBreadcrumbs($: CheerioAPI): string[] {
  const crumbs: string[] = [];
  $("[data-testid='breadcrumb'] a, .breadcrumb a, nav[aria-label='breadcrumb'] a").each(
    (_, el) => {
      const t = $(el).text().trim();
      if (t && t.toLowerCase() !== "home") crumbs.push(t);
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

function extractColorFromSpecs(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/^colou?r$/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function mapCategory(
  breadcrumbs: string[],
  categoryPath?: Array<{ name?: string }>,
): TomameCategory | null {
  // Try __NEXT_DATA__ category path first
  if (categoryPath?.length) {
    for (const segment of categoryPath) {
      if (segment.name) {
        const mapped = WALMART_CATEGORY_MAP.get(segment.name);
        if (mapped) return mapped;
      }
    }
  }

  // Fall back to breadcrumbs
  for (const crumb of breadcrumbs) {
    const mapped = WALMART_CATEGORY_MAP.get(crumb);
    if (mapped) return mapped;
  }

  return breadcrumbs.length > 0 ? TomameCategory.OTHER : null;
}

// ─── Scraper class ──────────────────────────────────────────────────

export class WalmartScraper extends PlatformScraper {
  public readonly domains = ["walmart.com", "walmart.ca"];

  public async scrape(url: string): Promise<ScrapedProduct> {
    const result = await this.browserless.scrapeContent({
      url,
      waitForSelector: "h1",
      stealth: true,
    });

    if (!result.success || !result.html) {
      throw new Error(result.error ?? "Failed to fetch page");
    }

    const $ = cheerio.load(result.html);
    return this.extract($);
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const jsonLd = extractJsonLd($);
    const nextData = extractNextData($);
    const productData = nextData?.props?.pageProps?.initialData?.data?.product;

    const specifications = {
      ...extractSpecificationsDom($),
    };

    // ── Title ──
    const title = productData?.name ?? jsonLd?.name ?? extractTitleDom($);

    // ── Price / Currency ──
    let price: number | null = null;
    let currency: string | null = "USD";

    const nextPrice = productData?.priceInfo?.currentPrice;
    if (nextPrice?.price != null) {
      price = nextPrice.price;
      currency = nextPrice.currencyUnit ?? "USD";
    } else if (jsonLd?.offers?.price != null) {
      price =
        typeof jsonLd.offers.price === "number"
          ? jsonLd.offers.price
          : parseFloat(String(jsonLd.offers.price));
      currency = jsonLd.offers.priceCurrency ?? "USD";
    } else {
      const domPrice = extractPriceDom($);
      price = domPrice.price;
      currency = domPrice.currency;
    }

    // ── Images ──
    const nextImages = (productData?.imageInfo?.allImages ?? [])
      .map((img) => img.url)
      .filter((u): u is string => !!u);
    const domImages = extractAllImages($);
    const allImages = nextImages.length > 0 ? nextImages : domImages;

    let mainImage: string | null = null;
    if (allImages.length > 0) {
      mainImage = allImages[0] ?? null;
    } else if (typeof jsonLd?.image === "string") {
      mainImage = jsonLd.image;
    } else if (Array.isArray(jsonLd?.image) && jsonLd.image.length > 0) {
      mainImage = jsonLd.image[0] ?? null;
    } else {
      mainImage = extractMainImageDom($);
    }

    // ── Brand ──
    let brand: string | null = productData?.brand ?? null;
    if (!brand) {
      if (typeof jsonLd?.brand === "string") {
        brand = jsonLd.brand;
      } else if (typeof jsonLd?.brand === "object" && jsonLd.brand?.name) {
        brand = jsonLd.brand.name;
      }
    }

    // ── Description ──
    const description =
      productData?.shortDescription ?? productData?.detailedDescription ?? extractDescriptionDom($);

    // ── Category ──
    const breadcrumbs = extractBreadcrumbs($);
    const category = mapCategory(breadcrumbs, productData?.category?.path);

    // ── Color ──
    const colorVariant = productData?.variantCriteria?.find(
      (v) => v.name?.toLowerCase() === "color" || v.name?.toLowerCase() === "actual_color",
    );
    const color = colorVariant?.selectedValue ?? extractColorFromSpecs(specifications);

    // ── Size ──
    const sizeVariant = productData?.variantCriteria?.find(
      (v) => v.name?.toLowerCase() === "size" || v.name?.toLowerCase() === "clothing_size",
    );
    const size = sizeVariant?.selectedValue ?? null;

    // ── Available sizes ──
    const availableSizes =
      sizeVariant?.variantList?.map((v) => v.name).filter((n): n is string => !!n) ?? [];

    // ── Rating ──
    const rating =
      jsonLd?.aggregateRating?.ratingValue ?? null;
    const reviewCount =
      jsonLd?.aggregateRating?.reviewCount ?? null;

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
      weight: extractWeight(specifications),
      dimensions: extractDimensions(specifications),
      specifications,
      metadata: {
        images: allImages,
        availableSizes,
        sku: productData?.idmlMap?.["sku"] ?? jsonLd?.sku ?? null,
        gtin: jsonLd?.gtin13 ?? null,
        rating,
        reviewCount,
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const walmartScraper = new WalmartScraper(browserlessClient);
