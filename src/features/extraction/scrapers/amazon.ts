import type { CheerioAPI } from "cheerio";
import type { PlatformScraper, ScrapedProduct } from "./types";
import { TomameCategory, AMAZON_CATEGORY_MAP } from "@/config/categories";
import type { ApifyAmazonProduct } from "@/lib/apify/client";
import { parseWeight } from "@/features/pricing/services/weight-parser";
import { amazonAsinOf, defaultCurrencyForUrl } from "../url";

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
  const breadcrumbSelectors = [
    "#wayfinding-breadcrumbs_feature_div ul li:first-child a",
    "#wayfinding-breadcrumbs_feature_div ul li a",
    ".a-breadcrumb li:first-child a",
    "#nav-subnav .nav-a:first-child",
  ];

  for (const selector of breadcrumbSelectors) {
    const els = $(selector);
    for (let i = 0; i < els.length; i++) {
      const crumb = els.eq(i).text().trim();
      if (!crumb) continue;
      const mapped = AMAZON_CATEGORY_MAP.get(crumb);
      if (mapped) return mapped;
    }
  }

  const deptText = $("#searchDropdownBox option[selected]").text().trim();
  if (deptText) {
    const mapped = AMAZON_CATEGORY_MAP.get(deptText);
    if (mapped) return mapped;
  }

  const firstBreadcrumb = $(breadcrumbSelectors[0]!).text().trim();
  if (firstBreadcrumb) return TomameCategory.OTHER;

  return null;
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

export function mapApifyAmazonProduct(item: ApifyAmazonProduct, sourceUrl: string): ScrapedProduct {
  const price = item.price ?? null;
  const currency = defaultCurrencyForUrl(sourceUrl);

  const specs: Record<string, string> = {};
  if (item.productDetails) {
    for (const detail of item.productDetails) {
      if (detail.name && detail.value) specs[detail.name] = detail.value;
    }
  }

  let brand: string | null = specs["Brand"] ?? null;
  if (!brand && item.manufacturer) {
    const match = item.manufacturer.match(/(?:Visit the |Brand:\s*)(.+?)(?:\s+Store)?$/i);
    brand = match?.[1]?.trim() ?? item.manufacturer;
  }

  let category: TomameCategory | null = null;
  if (item.breadcrumbs && item.breadcrumbs.length > 0) {
    for (const crumb of item.breadcrumbs) {
      if (crumb.text) {
        const mapped = AMAZON_CATEGORY_MAP.get(crumb.text);
        if (mapped) { category = mapped; break; }
      }
    }
  }
  if (!category) {
    const bsr = specs["Best Sellers Rank"];
    if (bsr) {
      for (const [key, mapped] of AMAZON_CATEGORY_MAP) {
        if (bsr.includes(key)) { category = mapped; break; }
      }
      if (!category) category = TomameCategory.OTHER;
    }
  }

  const images = item.imageUrlList ?? [];

  return {
    title: item.title ?? null,
    image: images[0] ?? null,
    price,
    currency,
    description: item.features?.join("\n") ?? item.productDescription ?? null,
    brand,
    category,
    size: specs["Size Name"] ?? null,
    weight: extractWeight(specs),
    weight_lbs: parseWeight(extractWeight(specs)),
    dimensions: extractDimensions(specs),
    specifications: specs,
    metadata: {
      images,
      availableSizes: [],
      asin: item.asin ?? specs["ASIN"] ?? null,
      rating: item.productRating ?? null,
      reviewCount: item.countReview != null ? `${item.countReview} ratings` : null,
      source: "apify",
    },
  };
}

export class AmazonScraper implements PlatformScraper {
  public readonly domains = ["amazon.com", "amazon.co.uk", "a.co", "amzn.to", "amzn.eu"];
  public readonly defaultCurrency = "USD";
  public readonly renderWaitSelector = "#productTitle, #ASIN";

  public isProductUrl(url: string): boolean {
    return amazonAsinOf(url) !== null;
  }

  public canonicalUrl(raw: string): string {
    try {
      const u = new URL(raw);
      const asin = amazonAsinOf(raw);
      if (asin) return `${u.origin}/dp/${asin}`;
      return `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  public looksLikeProductPage(html: string): boolean {
    if (/api-services-support@amazon\.com|Robot Check|captcha/i.test(html) && !html.includes("productTitle")) {
      return false;
    }
    // Amazon serves datacenter IPs a page with the title but no offer block.
    // Without a price marker, treat it as not rendered so the chain refetches.
    return html.includes("productTitle") && /a-offscreen|a-price|priceToPay|priceblock_/.test(html);
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
      size: extractSelectedSize($),
      weight: extractWeight(specifications),
      weight_lbs: parseWeight(extractWeight(specifications)),
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

export const amazonScraper = new AmazonScraper();
