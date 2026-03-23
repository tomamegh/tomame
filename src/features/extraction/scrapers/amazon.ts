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
  // Try multiple breadcrumb selectors — Amazon varies HTML across layouts
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

  // Check the department nav dropdown (shows "Automotive Parts & Accessories" etc.)
  const deptText = $("#searchDropdownBox option[selected]").text().trim();
  if (deptText) {
    const mapped = AMAZON_CATEGORY_MAP.get(deptText);
    if (mapped) return mapped;
  }

  // Check any breadcrumb text we found, even if not in the map
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

export class AmazonScraper extends PlatformScraper {
  /**
   * Strip Amazon search/session params — only the /dp/ASIN path matters.
   * Keeps the URL clean and avoids anti-bot triggers from tracking params.
   */
  private static cleanUrl(raw: string): string {
    try {
      const u = new URL(raw);
      // Short URLs (a.co) must be passed as-is — they redirect
      if (u.hostname === "a.co") return raw;

      // Extract ASIN from /dp/XXXX path segment
      const dpMatch = u.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
      if (dpMatch) {
        // Rebuild with just the product path, no query params
        return `${u.origin}/dp/${dpMatch[1]}`;
      }
      // Fallback: keep path, drop query params
      return `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }
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

  private static readonly FETCH_HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };

  /**
   * Resolve a short URL (a.co) to its final destination without downloading the body.
   */
  private async resolveShortUrl(shortUrl: string): Promise<string | null> {
    try {
      const res = await fetch(shortUrl, {
        method: "HEAD",
        headers: AmazonScraper.FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      // After redirect, res.url is the final destination
      return res.url || null;
    } catch {
      // HEAD might be blocked — try GET with redirect follow
      try {
        const res = await fetch(shortUrl, {
          headers: AmazonScraper.FETCH_HEADERS,
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        return res.url || null;
      } catch {
        return null;
      }
    }
  }

  /**
   * Fetch a product page via direct HTTP with browser-like headers.
   * Amazon serves SSR HTML — no JS rendering needed for product data.
   */
  private async directFetch(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: AmazonScraper.FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      if (html.includes("productTitle")) return html;
      return null;
    } catch {
      return null;
    }
  }

  public async scrape(url: string): Promise<ScrapedProduct> {
    let productUrl = url;

    // Step 1: Resolve short URL to full product URL
    if (new URL(url).hostname === "a.co") {
      const resolved = await this.resolveShortUrl(url);
      if (!resolved) {
        throw new Error("Failed to resolve short URL");
      }
      productUrl = resolved;
    }

    // Step 2: Clean the URL (strip tracking params, keep /dp/ASIN)
    const cleanedUrl = AmazonScraper.cleanUrl(productUrl);

    // Step 3: Direct HTTP fetch
    const html = await this.directFetch(cleanedUrl);
    if (!html) {
      throw new Error("Failed to fetch product page");
    }

    const $ = cheerio.load(html);
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
