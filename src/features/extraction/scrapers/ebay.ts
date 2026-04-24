import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, EBAY_CATEGORY_MAP } from "@/config/categories";
import { scrapeEbayWithApify, type ApifyEbayProduct } from "@/lib/apify/client";

import { logger } from "@/lib/logger";

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim();
  return t || null;
}

function extractTitle($: CheerioAPI): string | null {
  // Modern layout
  const modern = text($, "h1.x-item-title__mainTitle .ux-textspans")
    ?? text($, "h1.x-item-title__mainTitle")
    ?? text($, ".x-item-title__mainTitle .ux-textspans--BOLD")
    ?? text($, ".x-item-title__mainTitle");
  if (modern) return modern;

  // Legacy layout
  return text($, "#itemTitle")?.replace(/^Details about\s*/i, "").trim() ?? null;
}

function extractPrice($: CheerioAPI): { price: number | null; currency: string | null } {
  // Modern: <div class="x-price-primary"><span class="ux-textspans">US $129.99</span></div>
  const priceText =
    text($, ".x-price-primary .ux-textspans")
    ?? text($, ".x-price-primary")
    ?? text($, "[data-testid='x-price-primary'] .ux-textspans")
    ?? text($, "#prcIsum")
    ?? text($, "#mm-saleDscPrc")
    ?? text($, "#prcIsum_bidPrice");

  if (!priceText) return { price: null, currency: null };

  // "US $129.99", "£89.99", "EUR 99,00", "C $45.00"
  const currencyMap: Record<string, string> = {
    US: "USD",
    C: "CAD",
    AU: "AUD",
    EUR: "EUR",
    GBP: "GBP",
    CNY: "CNY",
    $: "USD",
    "£": "GBP",
    "€": "EUR",
    "¥": "CNY",
  };

  let currency: string | null = null;
  const codeMatch = priceText.match(/\b(US|C|AU|EUR|GBP|CNY)\s*\$?/);
  if (codeMatch?.[1]) currency = currencyMap[codeMatch[1]] ?? null;

  if (!currency) {
    const symbolMatch = priceText.match(/([£$€¥])/);
    if (symbolMatch?.[1]) currency = currencyMap[symbolMatch[1]] ?? null;
  }

  // Parse number — handle "129.99", "1,299.00", "99,00" (EU format)
  const numMatch = priceText.match(/([\d.,]+)/);
  if (!numMatch?.[1]) return { price: null, currency };

  let raw = numMatch[1];
  // If both , and . present: comma is thousands separator → drop commas
  // If only , present and looks like EU decimal (e.g. "99,00"): treat as decimal
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/,/g, "");
  } else if (raw.includes(",") && !raw.includes(".") && /,\d{1,2}$/.test(raw)) {
    raw = raw.replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(/,/g, "");
  }

  const price = parseFloat(raw);
  return { price: Number.isFinite(price) ? price : null, currency };
}

function extractMainImage($: CheerioAPI): string | null {
  // Modern carousel uses data-zoom-src for hi-res
  const modern = $(".ux-image-carousel-item img").first();
  const src = modern.attr("data-zoom-src")
    ?? modern.attr("src")
    ?? $(".ux-image-carousel-item.active img").first().attr("src")
    ?? $("#icImg").attr("src");
  return src ?? null;
}

function extractAllImages($: CheerioAPI): string[] {
  const images: string[] = [];

  $(".ux-image-carousel-item img").each((_, el) => {
    const src = $(el).attr("data-zoom-src") ?? $(el).attr("src");
    if (src && !images.includes(src)) images.push(src);
  });

  if (images.length === 0) {
    $("#vi_main_img_fs img, #altImages img").each((_, el) => {
      const src = $(el).attr("src");
      if (src && !images.includes(src)) images.push(src);
    });
  }

  return images;
}

function extractSpecifications($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  // Modern item specifics — .ux-labels-values blocks with __labels and __values
  $(".ux-labels-values").each((_, el) => {
    const key = $(el)
      .find(".ux-labels-values__labels .ux-textspans, .ux-labels-values__labels")
      .first()
      .text()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/:$/, "")
      .trim();
    const value = $(el)
      .find(".ux-labels-values__values .ux-textspans, .ux-labels-values__values")
      .first()
      .text()
      .trim()
      .replace(/\s+/g, " ");
    if (key && value) specs[key] = value;
  });

  // Legacy item specifics table
  $(".itemAttr table tr, #viTabs_0_is .itemAttr tr").each((_, el) => {
    $(el).find("td.attrLabels").each((i, labelEl) => {
      const key = $(labelEl).text().trim().replace(/\s+/g, " ").replace(/:$/, "").trim();
      const value = $(labelEl).next("td").text().trim().replace(/\s+/g, " ");
      if (key && value && !specs[key]) specs[key] = value;
    });
  });

  return specs;
}

function extractDescription($: CheerioAPI): string | null {
  // eBay puts long description in an iframe (#desc_ifr) — not available in static HTML.
  // Fall back to item specifics condition description or short summary.
  const condDesc = text($, ".x-item-condition-text .clipped")
    ?? text($, ".x-item-condition-text")
    ?? text($, "#vi-itm-cond");

  const subtitle = text($, ".x-item-title__subTitle .ux-textspans")
    ?? text($, "#subTitle");

  const parts = [subtitle, condDesc].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

function extractBrand($: CheerioAPI, specs: Record<string, string>): string | null {
  if (specs["Brand"]) return specs["Brand"];
  // Some listings use "Manufacturer"
  if (specs["Manufacturer"]) return specs["Manufacturer"];
  return null;
}

function extractCategory($: CheerioAPI): TomameCategory | null {
  const breadcrumbSelectors = [
    "nav.breadcrumbs li a span",
    "nav.breadcrumbs li a",
    ".breadcrumbs a",
    "nav[aria-label='Breadcrumb'] a",
    "#vi-VR-brumb-lnkLst li a",
  ];

  for (const selector of breadcrumbSelectors) {
    const els = $(selector);
    for (let i = 0; i < els.length; i++) {
      const crumb = els.eq(i).text().trim();
      if (!crumb) continue;
      const mapped = EBAY_CATEGORY_MAP.get(crumb);
      if (mapped) return mapped;
    }
    // If we found breadcrumbs but none matched, fall through to OTHER check below
    if (els.length > 0) {
      const firstCrumb = els.first().text().trim();
      if (firstCrumb) return TomameCategory.OTHER;
    }
  }

  return null;
}

function extractWeight(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/\b(item\s+)?weight\b/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function extractDimensions(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/dimension|size/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function extractItemId(url: string, $: CheerioAPI): string | null {
  // URL path: /itm/:id or /itm/:slug/:id
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }
  const meta = $("meta[itemprop='productID']").attr("content")
    ?? $("meta[name='twitter:data1']").attr("content");
  if (meta) {
    const match = meta.match(/(\d{9,})/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function mapApifyToScrapedProduct(item: ApifyEbayProduct): ScrapedProduct {
  // Normalize item specifics — actors return either object or [{name,value}] arrays
  const specs: Record<string, string> = {};
  if (Array.isArray(item.itemSpecifics)) {
    for (const d of item.itemSpecifics) {
      if (d?.name && d?.value) specs[d.name] = String(d.value);
    }
  } else if (item.itemSpecifics && typeof item.itemSpecifics === "object") {
    for (const [k, v] of Object.entries(item.itemSpecifics)) {
      if (k && v != null) specs[k] = String(v);
    }
  }
  if (Array.isArray(item.productDetails)) {
    for (const d of item.productDetails) {
      if (d?.name && d?.value && !specs[d.name]) specs[d.name] = String(d.value);
    }
  }

  const brand = item.brand ?? specs["Brand"] ?? specs["Manufacturer"] ?? null;

  // Collect breadcrumb text from either shape (strings or {text,url})
  const crumbs: string[] = [];
  if (Array.isArray(item.breadcrumbs)) {
    for (const c of item.breadcrumbs) {
      if (typeof c === "string") crumbs.push(c);
      else if (c?.text) crumbs.push(c.text);
    }
  }
  if (Array.isArray(item.categoryPath)) crumbs.push(...item.categoryPath);

  let category: TomameCategory | null = null;
  for (const c of crumbs) {
    const mapped = EBAY_CATEGORY_MAP.get(c);
    if (mapped) { category = mapped; break; }
  }
  if (!category && crumbs.length > 0) category = TomameCategory.OTHER;

  const images = item.imageUrlList ?? item.images ?? [];
  const mainImage = item.mainImage ?? images[0] ?? null;

  const seller = typeof item.seller === "string"
    ? item.seller
    : (item.seller?.username ?? item.seller?.name ?? null);

  const priceNum = typeof item.price === "string" ? parseFloat(item.price) : item.price;
  const price = typeof priceNum === "number" && Number.isFinite(priceNum) ? priceNum : null;

  const itemId = item.itemId ?? item.itemNumber ?? item.productID ?? specs["eBay Item Number"] ?? null;

  const description = item.description
    ?? (item.features?.length ? item.features.join("\n") : null)
    ?? item.subtitle
    ?? null;

  return {
    title: item.title ?? null,
    image: mainImage,
    price,
    currency: item.currency ?? null,
    description,
    brand,
    category,
    size: specs["Size"] ?? null,
    weight: extractWeight(specs),
    dimensions: extractDimensions(specs),
    specifications: specs,
    metadata: {
      images,
      itemId: itemId != null ? String(itemId) : null,
      condition: item.condition ?? specs["Condition"] ?? null,
      seller,
      source: "apify",
    },
  };
}

export class EbayScraper extends PlatformScraper {
  public readonly domains = [
    "ebay.com",
    "ebay.co.uk",
    "ebay.us", // eBay short URL (mobile app / share button, resolves to ebay.com)
    "ebay.to", // eBay short URL (alternate share domain)
    // Future: "ebay.ca", "ebay.de", "ebay.com.au", etc.
  ];

  private static readonly SHORT_URL_HOSTS = new Set(["ebay.us", "ebay.to"]);

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
   * Keep only /itm/:id — drop tracking/affiliate params.
   */
  private static cleanUrl(raw: string): string {
    try {
      const u = new URL(raw);
      const match = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/);
      if (match?.[1]) {
        return `${u.origin}/itm/${match[1]}`;
      }
      // Fallback: keep path, drop query params
      return `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  /**
   * Resolve an eBay short URL (ebay.us) to its final /itm/ destination
   * without downloading the full body. Mirrors AmazonScraper.resolveShortUrl.
   */
  private async resolveShortUrl(shortUrl: string): Promise<string | null> {
    try {
      const res = await fetch(shortUrl, {
        method: "HEAD",
        headers: EbayScraper.FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      return res.url || null;
    } catch {
      try {
        const res = await fetch(shortUrl, {
          headers: EbayScraper.FETCH_HEADERS,
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        return res.url || null;
      } catch {
        return null;
      }
    }
  }

  private async directFetch(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: EbayScraper.FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      // Validate the HTML looks like a real item page
      if (html.includes("x-item-title") || html.includes("itemTitle")) return html;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * eBay loads the long description inside an iframe (#desc_ifr).
   * Fetch that URL separately and return the cleaned text.
   */
  private async fetchIframeDescription($: CheerioAPI): Promise<string | null> {
    const src = $("#desc_ifr").attr("src");
    if (!src) return null;
    try {
      const res = await fetch(src, {
        headers: EbayScraper.FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const $desc = cheerio.load(html);
      $desc("script, style, noscript").remove();
      const text = $desc("body").text()
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return text || null;
    } catch {
      return null;
    }
  }

  public async scrape(url: string): Promise<ScrapedProduct> {
    let productUrl = url;

    // Resolve short URLs (ebay.us, ebay.to) to the full /itm/ destination first
    try {
      if (EbayScraper.SHORT_URL_HOSTS.has(new URL(url).hostname.toLowerCase())) {
        const resolved = await this.resolveShortUrl(url);
        if (!resolved) {
          throw new Error("Failed to resolve eBay short URL");
        }
        productUrl = resolved;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Failed to resolve")) throw err;
      // URL parsing failure — let it flow through to cleanUrl which also guards
    }

    const cleanedUrl = EbayScraper.cleanUrl(productUrl);

    const html = await this.directFetch(cleanedUrl);
    if (html) {
      const $ = cheerio.load(html);
      const product = this.extract($);
      // Attach item id from the URL if extract couldn't find it in meta
      if (!product.metadata.itemId) {
        product.metadata.itemId = extractItemId(cleanedUrl, $);
      }
      // Enrich description from the #desc_ifr iframe when available
      const iframeDesc = await this.fetchIframeDescription($);
      if (iframeDesc) product.description = iframeDesc;
      return product;
    }

    // Fallback to Apify when direct fetch fails (e.g. eBay blocking)
    logger.warn("ebay direct fetch failed, falling back to Apify", { url: cleanedUrl });
    const apifyResult = await scrapeEbayWithApify(cleanedUrl);
    if (apifyResult) {
      return mapApifyToScrapedProduct(apifyResult);
    }

    throw new Error("Failed to fetch eBay product page (direct fetch and Apify both failed)");
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const { price, currency } = extractPrice($);
    const specifications = extractSpecifications($);
    const allImages = extractAllImages($);

    return {
      title: extractTitle($),
      image: extractMainImage($),
      price,
      currency,
      description: extractDescription($),
      brand: extractBrand($, specifications),
      category: extractCategory($),
      size: specifications["Size"] ?? null,
      weight: extractWeight(specifications),
      dimensions: extractDimensions(specifications),
      specifications,
      metadata: {
        images: allImages,
        itemId: null,
        condition: text($, ".x-item-condition-text .ux-textspans") ?? text($, ".x-item-condition-text"),
        seller: text($, ".x-sellercard-atf__info__about-seller a") ?? text($, ".mbg-nw"),
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const ebayScraper = new EbayScraper(browserlessClient);
