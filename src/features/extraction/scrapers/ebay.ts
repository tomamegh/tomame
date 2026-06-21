import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, EBAY_CATEGORY_MAP } from "@/config/categories";
import { scrapeEbayWithApify, type ApifyEbayProduct } from "@/lib/apify/client";

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim();
  return t || null;
}

function extractTitle($: CheerioAPI): string | null {
  const modern = text($, "h1.x-item-title__mainTitle .ux-textspans")
    ?? text($, "h1.x-item-title__mainTitle")
    ?? text($, ".x-item-title__mainTitle .ux-textspans--BOLD")
    ?? text($, ".x-item-title__mainTitle");
  if (modern) return modern;
  return text($, "#itemTitle")?.replace(/^Details about\s*/i, "").trim() ?? null;
}

function extractPrice($: CheerioAPI): { price: number | null; currency: string | null } {
  const priceText =
    text($, ".x-price-primary .ux-textspans")
    ?? text($, ".x-price-primary")
    ?? text($, "[data-testid='x-price-primary'] .ux-textspans")
    ?? text($, "#prcIsum")
    ?? text($, "#mm-saleDscPrc")
    ?? text($, "#prcIsum_bidPrice");

  if (!priceText) return { price: null, currency: null };

  const currencyMap: Record<string, string> = {
    US: "USD", C: "CAD", AU: "AUD", EUR: "EUR", GBP: "GBP", CNY: "CNY",
    $: "USD", "£": "GBP", "€": "EUR", "¥": "CNY",
  };

  let currency: string | null = null;
  const codeMatch = priceText.match(/\b(US|C|AU|EUR|GBP|CNY)\s*\$?/);
  if (codeMatch?.[1]) currency = currencyMap[codeMatch[1]] ?? null;

  if (!currency) {
    const symbolMatch = priceText.match(/([£$€¥])/);
    if (symbolMatch?.[1]) currency = currencyMap[symbolMatch[1]] ?? null;
  }

  const numMatch = priceText.match(/([\d.,]+)/);
  if (!numMatch?.[1]) return { price: null, currency };

  let raw = numMatch[1];
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

  $(".ux-labels-values").each((_, el) => {
    const key = $(el)
      .find(".ux-labels-values__labels .ux-textspans, .ux-labels-values__labels")
      .first().text().trim().replace(/\s+/g, " ").replace(/:$/, "").trim();
    const value = $(el)
      .find(".ux-labels-values__values .ux-textspans, .ux-labels-values__values")
      .first().text().trim().replace(/\s+/g, " ");
    if (key && value) specs[key] = value;
  });

  $(".itemAttr table tr, #viTabs_0_is .itemAttr tr").each((_, el) => {
    $(el).find("td.attrLabels").each((_, labelEl) => {
      const key = $(labelEl).text().trim().replace(/\s+/g, " ").replace(/:$/, "").trim();
      const value = $(labelEl).next("td").text().trim().replace(/\s+/g, " ");
      if (key && value && !specs[key]) specs[key] = value;
    });
  });

  return specs;
}

function extractDescription($: CheerioAPI): string | null {
  const condDesc = text($, ".x-item-condition-text .clipped")
    ?? text($, ".x-item-condition-text")
    ?? text($, "#vi-itm-cond");
  const subtitle = text($, ".x-item-title__subTitle .ux-textspans") ?? text($, "#subTitle");
  const parts = [subtitle, condDesc].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

function extractBrand(_$: CheerioAPI, specs: Record<string, string>): string | null {
  return specs["Brand"] ?? specs["Manufacturer"] ?? null;
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

function mapApifyToScrapedProduct(item: ApifyEbayProduct): ScrapedProduct {
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
    ?? item.subtitle ?? null;

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
    "ebay.us",
    "ebay.to",
  ];

  private static readonly SHORT_URL_HOSTS = new Set(["ebay.us", "ebay.to"]);

  private static cleanUrl(raw: string): string {
    try {
      const u = new URL(raw);
      const match = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/);
      if (match?.[1]) return `${u.origin}/itm/${match[1]}`;
      return `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  private static readonly BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  private async resolveShortUrl(shortUrl: string): Promise<string | null> {
    const headers = { "User-Agent": EbayScraper.BROWSER_UA };
    try {
      const res = await fetch(shortUrl, {
        method: "HEAD",
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (res.url && res.url !== shortUrl) return res.url;
      // HEAD blocked — retry with GET
      const res2 = await fetch(shortUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      return res2.url || null;
    } catch {
      return null;
    }
  }

  public async scrape(url: string): Promise<ScrapedProduct> {
    let productUrl = url;

    try {
      if (EbayScraper.SHORT_URL_HOSTS.has(new URL(url).hostname.toLowerCase())) {
        const resolved = await this.resolveShortUrl(url);
        if (!resolved) throw new Error("Failed to resolve eBay short URL");
        productUrl = resolved;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Failed to resolve")) throw err;
    }

    const cleanedUrl = EbayScraper.cleanUrl(productUrl);

    const result = await scrapeEbayWithApify(cleanedUrl);
    if (result) return mapApifyToScrapedProduct(result);

    throw new Error("Failed to fetch eBay product page via Apify");
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

export const ebayScraper = new EbayScraper(browserlessClient);
