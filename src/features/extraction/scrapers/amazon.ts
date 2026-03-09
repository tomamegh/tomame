import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, AMAZON_CATEGORY_MAP } from "@/config/categories";

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim();
  return t || null;
}

function extractPrice($: CheerioAPI): { price: number | null; currency: string | null } {
  const priceText =
    text($, "#corePrice_feature_div .a-offscreen") ??
    text($, "#priceblock_ourprice") ??
    text($, "#priceblock_dealprice") ??
    text($, ".a-price .a-offscreen");

  if (!priceText) return { price: null, currency: null };

  const match = priceText.match(/([£$€¥])\s*([\d,]+\.?\d*)/);
  if (!match) {
    const numMatch = priceText.match(/([\d,]+\.?\d*)/);
    return {
      price: numMatch?.[1] ? parseFloat(numMatch[1].replace(/,/g, "")) : null,
      currency: null,
    };
  }

  const symbol = match[1] ?? "";
  const symbolMap: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "¥": "CNY" };
  return {
    price: parseFloat((match[2] ?? "0").replace(/,/g, "")),
    currency: symbolMap[symbol] ?? null,
  };
}

function extractMainImage($: CheerioAPI): string | null {
  const img = $("#landingImage").attr("data-old-hires")
    ?? $("#landingImage").attr("src")
    ?? $("#imgBlkFront").attr("src");
  return img ?? null;
}

function extractAllImages($: CheerioAPI): string[] {
  const images: string[] = [];

  $("script").each((_, el) => {
    const scriptText = $(el).html() ?? "";
    const hiResMatches = scriptText.matchAll(/"hiRes"\s*:\s*"(https?:\/\/[^"]+)"/g);
    for (const m of hiResMatches) {
      if (m[1] && !images.includes(m[1])) images.push(m[1]);
    }
    if (images.length === 0) {
      const largeMatches = scriptText.matchAll(/"large"\s*:\s*"(https?:\/\/[^"]+)"/g);
      for (const m of largeMatches) {
        if (m[1] && !images.includes(m[1])) images.push(m[1]);
      }
    }
  });

  if (images.length === 0) {
    $("#altImages .a-button-thumbnail img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const large = src.replace(/\._[A-Z0-9_,]+_\./, ".");
        if (!images.includes(large)) images.push(large);
      }
    });
  }

  return images;
}

function extractColor($: CheerioAPI, specs: Record<string, string>): string | null {
  // Try the selected color variant swatch first
  const selected = $("#variation_color_name .selection").first().text().trim();
  if (selected) return selected;

  // Fall back to specs table
  for (const key of Object.keys(specs)) {
    if (/^colou?r$/i.test(key)) return specs[key] ?? null;
  }

  return null;
}

function extractSelectedSize($: CheerioAPI): string | null {
  const selected = text($, "#native_dropdown_selected_size_name option[selected]");
  if (selected && selected !== "Select") return selected;

  const swatchSelected = $(".swatchSelect .a-button-text").first().text().trim();
  if (swatchSelected) return swatchSelected;

  return null;
}

function extractAvailableSizes($: CheerioAPI): string[] {
  const sizes: string[] = [];

  $("#native_dropdown_selected_size_name option").each((_, el) => {
    const val = $(el).text().trim();
    if (val && val !== "Select") sizes.push(val);
  });

  if (sizes.length === 0) {
    $("#variation_size_name .a-button-text").each((_, el) => {
      const val = $(el).text().trim();
      if (val) sizes.push(val);
    });
  }

  return sizes;
}

function extractSpecifications($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  $("table.a-normal tr").each((_, el) => {
    const key = $(el).find("td.a-span3 .a-text-bold").text().trim().replace(/\s+/g, " ");
    const value = $(el).find("td.a-span9 .po-break-word").text().trim().replace(/\s+/g, " ");
    if (key && value) specs[key] = value;
  });

  $("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr").each((_, el) => {
    const key = $(el).find("th").text().trim().replace(/\s+/g, " ");
    const value = $(el).find("td").text().trim().replace(/\s+/g, " ");
    if (key && value && !specs[key]) specs[key] = value;
  });

  $("#productDetails_techSpec_section_2 tr").each((_, el) => {
    const key = $(el).find("th").text().trim().replace(/\s+/g, " ");
    const value = $(el).find("td").text().trim().replace(/\s+/g, " ");
    if (key && value && !specs[key]) specs[key] = value;
  });

  $("#detailBullets_feature_div .a-list-item").each((_, el) => {
    const parts = $(el).text().trim().split(/\s*:\s*/);
    if (parts.length >= 2) {
      const key = (parts[0] ?? "").replace(/[^\w\s]/g, "").trim();
      const value = parts.slice(1).join(":").trim();
      if (key && value && !specs[key]) specs[key] = value;
    }
  });

  return specs;
}

function extractDescription($: CheerioAPI): string | null {
  const bullets: string[] = [];
  $("#feature-bullets .a-list-item").each((_, el) => {
    const t = $(el).text().trim();
    if (t) bullets.push(t);
  });
  if (bullets.length > 0) return bullets.join("\n");

  return text($, "#productDescription p") ?? text($, "#productDescription");
}

function extractBrand($: CheerioAPI): string | null {
  return text($, "#bylineInfo") ?? text($, "a#brand") ?? null;
}

function extractCategory($: CheerioAPI): TomameCategory | null {
  // Get the first breadcrumb link (top-level category)
  const firstBreadcrumb = $(
    "#wayfinding-breadcrumbs_feature_div ul li:first-child a"
  )
    .text()
    .trim();

  if (!firstBreadcrumb) return null;

  return AMAZON_CATEGORY_MAP.get(firstBreadcrumb) ?? TomameCategory.OTHER;
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

export class AmazonScraper extends PlatformScraper {
  public readonly domains = [
    "amazon.com",
    "amazon.co.uk",
    "amazon.ca",
    "amazon.de",
    "amazon.fr",
    "amazon.es",
    "amazon.it",
    "amazon.com.au",
    "amazon.in",
    "amazon.co.jp",
    "a.co", // Amazon short URL (mobile app sharing)
  ];

  public async scrape(url: string): Promise<ScrapedProduct> {
    const result = await this.browserless.scrapeContent({
      url,
      waitForSelector: "#productTitle",
    });

    if (!result.success || !result.html) {
      throw new Error(result.error ?? "Failed to fetch page");
    }

    const $ = cheerio.load(result.html);
    return this.extract($);
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const { price, currency } = extractPrice($);
    const specifications = extractSpecifications($);
    const allImages = extractAllImages($);
    const availableSizes = extractAvailableSizes($);

    return {
      title: text($, "#productTitle"),
      image: extractMainImage($),
      price,
      currency,
      description: extractDescription($),
      brand: extractBrand($),
      category: extractCategory($),
      color: extractColor($, specifications),
      size: extractSelectedSize($),
      weight: extractWeight(specifications),
      dimensions: extractDimensions(specifications),
      specifications,
      metadata: {
        images: allImages,
        availableSizes,
        asin: $("input#ASIN").val() ?? null,
        rating: text($, "#acrPopover .a-icon-alt"),
        reviewCount: text($, "#acrCustomerReviewText"),
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const amazonScraper = new AmazonScraper(browserlessClient);
