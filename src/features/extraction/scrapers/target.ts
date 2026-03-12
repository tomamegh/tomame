import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, TARGET_CATEGORY_MAP } from "@/config/categories";

// ─── __TGT_DATA__ helpers ───────────────────────────────────────────

interface TgtPageContent {
  product?: {
    item?: {
      product_description?: {
        title?: string;
        downstream_description?: string;
        bullet_descriptions?: string[];
        soft_bullets?: { bullets?: string[] };
      };
      enrichment?: {
        images?: {
          primary_image_url?: string;
          alternate_image_urls?: string[];
        };
      };
      product_classification?: {
        product_type_name?: string;
        item_type_name?: string;
      };
      product_brand?: { brand?: string };
      primary_brand?: { name?: string };
    };
    price?: {
      formatted_current_price?: string;
      current_retail?: number;
      currency?: string;
      reg_retail?: number;
    };
    ratings_and_reviews?: {
      statistics?: {
        rating?: { average?: number; count?: number };
        review_count?: number;
      };
    };
    children?: Array<{
      item?: {
        product_description?: { title?: string };
        variation?: Record<string, string>;
        primary_brand?: { name?: string };
      };
      price?: { current_retail?: number };
    }>;
  };
}

/**
 * Target wraps page data as two JSON.parse calls inside __TGT_DATA__:
 *   1. Config/services blob
 *   2. Page content blob with __PRELOADED_QUERIES__ containing product data
 *
 * Both use escaped quote strings: JSON.parse("{\"key\": ...}")
 * We need the second one that contains __PRELOADED_QUERIES__.
 */
function extractTgtData($: CheerioAPI): TgtPageContent | null {
  let result: TgtPageContent | null = null;

  $("script").each((_, el) => {
    if (result) return;
    const scriptText = $(el).html() ?? "";
    if (!scriptText.includes("__PRELOADED_QUERIES__")) return;

    try {
      // Find all JSON.parse("...") blocks and parse each
      const regex = /JSON\.parse\("([\s\S]*?)"\)\s*\)/g;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(scriptText)) !== null) {
        try {
          const captured = match[1];
          if (!captured) continue;
          const unescaped = captured
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");

          const parsed = JSON.parse(unescaped);

          // Look for __PRELOADED_QUERIES__ in this blob
          const queries: unknown[] =
            parsed?.__PRELOADED_QUERIES__?.queries ?? [];

          for (const query of queries) {
            if (!Array.isArray(query)) continue;
            const data = query[1]?.data;
            if (data?.product?.item || data?.product?.price) {
              result = data as TgtPageContent;
              return;
            }
          }
        } catch {
          /* skip unparseable blobs */
        }
      }
    } catch {
      /* ignore */
    }
  });

  return result;
}

// ─── DOM-based fallback helpers ─────────────────────────────────────

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim();
  return t || null;
}

function extractTitleDom($: CheerioAPI): string | null {
  return text($, "h1");
}

function extractPriceDom($: CheerioAPI): { price: number | null; currency: string | null } {
  const priceText = text($, '[data-test="@web/Price/PriceFull"]');
  if (!priceText) return { price: null, currency: null };

  // Price text looks like "$38.47 reg $54.95Sale save ..."
  const match = priceText.match(/\$\s*([\d,]+\.?\d*)/);
  if (match?.[1]) {
    return { price: parseFloat(match[1].replace(/,/g, "")), currency: "USD" };
  }
  return { price: null, currency: "USD" };
}

function extractAllImagesDom($: CheerioAPI): string[] {
  const images: string[] = [];

  $('[data-test="@web/SiteTopOfFunnel/BaseStackedImageGallery"] img').each((_, el) => {
    const src = $(el).attr("src");
    if (src && !images.includes(src)) {
      const large = src.replace(/\?.*$/, "?fmt=webp&qlt=80&wid=800&hei=800");
      images.push(large);
    }
  });

  return images;
}

function extractBreadcrumbs($: CheerioAPI): string[] {
  const crumbs: string[] = [];
  $('[data-test="@web/Breadcrumbs/BreadcrumbLink"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.toLowerCase() !== "target") crumbs.push(t);
  });
  return crumbs;
}

function extractDescriptionDom($: CheerioAPI): string | null {
  const section = $(
    '[data-test="@web/site-top-of-funnel/ProductDetailCollapsible-ProductDetails"]',
  );
  if (!section.length) return null;

  // Get text content, excluding the "Description" heading
  const fullText = section.text().trim();
  return fullText.replace(/^Description\s*/i, "").trim() || null;
}

function extractSpecificationsDom($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  const section = $(
    '[data-test="@web/site-top-of-funnel/ProductDetailCollapsible-Specifications"]',
  );
  if (!section.length) return specs;

  // Specs are rendered as label/value pairs in divs
  section.find("div").each((_, el) => {
    const children = $(el).children();
    if (children.length >= 2) {
      const label = children.first().text().trim().replace(/:$/, "");
      const value = children.last().text().trim();
      if (label && value && label !== value && label !== "Specifications") {
        specs[label] = value;
      }
    }
  });

  return specs;
}

function extractVariationsDom($: CheerioAPI): {
  color: string | null;
  size: string | null;
  availableSizes: string[];
} {
  const container = $('[data-test="@web/VariationComponent"]');
  const fullText = container.text().trim().toLowerCase();

  let color: string | null = null;
  let size: string | null = null;
  const availableSizes: string[] = [];

  // Parse "sizesSize guidexssmlxl1x2x3x4xcolorvibrant green" pattern
  // Color comes after "color" label
  const colorMatch = fullText.match(/color\s*(.+)/);
  if (colorMatch?.[1]) {
    color = colorMatch[1].trim();
    // Title-case the color
    color = color.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Try to extract selected size from variation buttons
  container.find("button[aria-pressed='true'], [aria-checked='true']").each((_, el) => {
    const val = $(el).text().trim();
    if (val && !size) size = val;
  });

  // Collect all available sizes from buttons
  container.find("button").each((_, el) => {
    const val = $(el).text().trim().toUpperCase();
    if (val && val.length <= 5 && !availableSizes.includes(val)) {
      availableSizes.push(val);
    }
  });

  return { color, size, availableSizes };
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

function mapCategory(
  breadcrumbs: string[],
  productTypeName?: string,
): TomameCategory | null {
  if (productTypeName) {
    const mapped = TARGET_CATEGORY_MAP.get(productTypeName);
    if (mapped) return mapped;
  }

  for (const crumb of breadcrumbs) {
    const mapped = TARGET_CATEGORY_MAP.get(crumb);
    if (mapped) return mapped;
  }

  return breadcrumbs.length > 0 ? TomameCategory.OTHER : null;
}

// ─── Scraper class ──────────────────────────────────────────────────

export class TargetScraper extends PlatformScraper {
  public readonly domains = ["target.com"];

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
    const tgtData = extractTgtData($);
    const item = tgtData?.product?.item;
    const priceData = tgtData?.product?.price;

    const specifications = extractSpecificationsDom($);

    // Parse bullet descriptions from preloaded data into specs
    const bullets = item?.product_description?.bullet_descriptions ?? [];
    for (const bullet of bullets) {
      // Bullets are HTML like "<B>Material:</B> 100% Cotton"
      const match = bullet.match(/<[Bb]>(.*?)<\/[Bb]>:?\s*(.*)/);
      if (match?.[1] && match?.[2]) {
        const key = match[1].replace(/:$/, "").trim();
        const value = match[2].replace(/<[^>]*>/g, "").trim();
        if (key && value) specifications[key] = value;
      }
    }

    // ── Title ──
    const title = item?.product_description?.title ?? extractTitleDom($);

    // ── Price / Currency ──
    let price: number | null = null;
    let currency: string | null = "USD";

    if (priceData?.current_retail != null) {
      price = priceData.current_retail;
      currency = priceData.currency ?? "USD";
    } else {
      const domPrice = extractPriceDom($);
      price = domPrice.price;
      currency = domPrice.currency;
    }

    // ── Images ──
    const preloadedImages: string[] = [];
    const primaryImage = item?.enrichment?.images?.primary_image_url;
    if (primaryImage) preloadedImages.push(primaryImage);
    const altImages = item?.enrichment?.images?.alternate_image_urls ?? [];
    for (const img of altImages) {
      if (img && !preloadedImages.includes(img)) preloadedImages.push(img);
    }

    const domImages = extractAllImagesDom($);
    const allImages = preloadedImages.length > 0 ? preloadedImages : domImages;
    const mainImage = allImages[0] ?? null;

    // ── Brand ──
    const brand = item?.primary_brand?.name ?? item?.product_brand?.brand ?? null;

    // ── Description ──
    const description =
      item?.product_description?.downstream_description ?? extractDescriptionDom($);

    // ── Category ──
    const breadcrumbs = extractBreadcrumbs($);
    const productTypeName = item?.product_classification?.product_type_name;
    const category = mapCategory(breadcrumbs, productTypeName);

    // ── Color / Size / Available Sizes ──
    const variations = extractVariationsDom($);
    const color = variations.color;
    const size = variations.size;

    // Extract sizes from children titles (format: "Product Name SIZE / COLOR.")
    const availableSizes = [...variations.availableSizes];
    if (tgtData?.product?.children) {
      for (const child of tgtData.product.children) {
        const childTitle = child.item?.product_description?.title;
        if (childTitle) {
          // Parse "... XS / Jet Black." or "... 2X / Vibrant Green."
          const parts = childTitle.match(/\s+(\S+)\s*\/\s*/);
          if (parts?.[1]) {
            const sizeVal = parts[1];
            if (!availableSizes.includes(sizeVal)) {
              availableSizes.push(sizeVal);
            }
          }
        }
      }
    }

    // ── Rating ──
    const stats = tgtData?.product?.ratings_and_reviews?.statistics;
    const rating = stats?.rating?.average?.toString() ?? null;
    const reviewCount = stats?.review_count?.toString() ?? null;

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
        sku: null,
        gtin: null,
        rating,
        reviewCount,
        itemTypeName: item?.product_classification?.item_type_name ?? null,
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const targetScraper = new TargetScraper(browserlessClient);
