import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, MICROCENTER_CATEGORY_MAP } from "@/config/categories";
import { logger } from "@/lib/logger";

type JsonLdNode = Record<string, unknown>;

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim().replace(/\s+/g, " ");
  return t || null;
}

/** Collect all <script type="application/ld+json"> blocks as parsed objects. */
function parseJsonLd($: CheerioAPI): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    const parsed = tryParseLenient(raw);
    if (!parsed) return;
    if (Array.isArray(parsed)) {
      for (const item of parsed) if (item && typeof item === "object") nodes.push(item as JsonLdNode);
    } else if (typeof parsed === "object") {
      nodes.push(parsed as JsonLdNode);
    }
  });
  return nodes;
}

/** Parse JSON; on failure, replace raw control characters with spaces and retry.
 *  Micro Center occasionally embeds literal newlines inside Product description strings
 *  which makes JSON.parse reject the whole block. */
function tryParseLenient(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(raw.replace(/[\n\r\t]/g, " "));
    } catch {
      return null;
    }
  }
}

function findByType(nodes: JsonLdNode[], type: string): JsonLdNode | null {
  return nodes.find((n) => {
    const t = n["@type"];
    return t === type || (Array.isArray(t) && t.includes(type));
  }) ?? null;
}

function extractFromProductLink($: CheerioAPI): {
  price: number | null;
  name: string | null;
  id: string | null;
  brand: string | null;
  category: string | null;
} {
  // <span class="ProductLink_683524" data-name="..." data-id="..." data-price="9.970000"
  //        data-brand="..." data-category="Personal Security Products|192" ...>
  const span = $("[class^='ProductLink_']").first();
  if (span.length === 0) {
    return { price: null, name: null, id: null, brand: null, category: null };
  }

  const priceRaw = span.attr("data-price");
  const price = priceRaw ? parseFloat(priceRaw) : null;
  const dataCategory = span.attr("data-category") ?? null;
  // Strip trailing "|<id>" from category strings like "Personal Security Products|192"
  const category = dataCategory?.split("|")[0]?.trim() ?? null;

  return {
    price: Number.isFinite(price) ? price : null,
    name: span.attr("data-name")?.trim() || null,
    id: span.attr("data-id")?.trim() || null,
    brand: span.attr("data-brand")?.trim() || null,
    category,
  };
}

function extractImages(product: JsonLdNode | null, $: CheerioAPI): string[] {
  const images: string[] = [];
  if (product) {
    const img = product.image;
    if (typeof img === "string") images.push(img);
    else if (Array.isArray(img)) {
      for (const i of img) if (typeof i === "string" && !images.includes(i)) images.push(i);
    }
  }
  // og:image is always present on Micro Center product pages and points to the canonical hero image
  if (images.length === 0) {
    const og = $("meta[property='og:image']").attr("content");
    if (og) images.push(og);
  }
  // HTML fallback: <img> tags in the product gallery
  if (images.length === 0) {
    $("#productImage img, .ProductImage img, #mainProductImage, .product-image img").each((_, el) => {
      const src = $(el).attr("data-src") ?? $(el).attr("src");
      if (src && !images.includes(src)) images.push(src);
    });
  }
  return images;
}

/**
 * productimages.microcenter.com is gated by a Cloudflare challenge, so direct
 * <img src> loads (including Next.js server-side image optimization) get a 403.
 * Route these URLs through our /api/img-proxy endpoint which uses Browserless
 * to fetch the bytes with a valid browser session.
 */
function proxyMicrocenterImage(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "productimages.microcenter.com") {
      return `/api/img-proxy?src=${encodeURIComponent(url)}`;
    }
  } catch {
    // fall through
  }
  return url;
}

function extractSpecifications($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  // Micro Center's spec tab uses #specificationTab with rows of label → value,
  // rendered as <div class="specs-section"> … <ul class="specs-list"><li><span class="label">K</span><span>V</span></li></ul>.
  $("#Specs li, #specifications li, .specs-list li, #tab-specs li").each((_, el) => {
    const label = $(el).find(".label, .spec-label, strong").first().text().trim().replace(/:$/, "").trim();
    const value = $(el).find(".value, .spec-value, span:not(.label)").first().text().trim();
    if (label && value) specs[label] = value.replace(/\s+/g, " ");
  });

  // Alternate layout: definition list (<dl><dt>K</dt><dd>V</dd></dl>)
  $("#Specs dl, #specifications dl, .spec-table dl").each((_, dl) => {
    $(dl).find("dt").each((_, dt) => {
      const key = $(dt).text().trim().replace(/:$/, "").trim();
      const value = $(dt).next("dd").text().trim().replace(/\s+/g, " ");
      if (key && value && !specs[key]) specs[key] = value;
    });
  });

  // Table layout
  $("#Specs table tr, #specifications table tr, .spec-table tr").each((_, tr) => {
    const cells = $(tr).find("th, td");
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim().replace(/:$/, "").trim();
      const value = $(cells[1]).text().trim().replace(/\s+/g, " ");
      if (key && value && !specs[key]) specs[key] = value;
    }
  });

  return specs;
}

function extractWeight(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/\b(item\s+)?weight\b/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function extractDimensions(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/\bdimensions?\b/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function mapCategory(
  breadcrumb: JsonLdNode | null,
  productLinkCategory: string | null,
): TomameCategory | null {
  // Try breadcrumb chain first (deepest → shallowest) for the most specific match
  if (breadcrumb) {
    const items = breadcrumb.itemListElement;
    if (Array.isArray(items)) {
      const names: string[] = [];
      for (const raw of items) {
        if (raw && typeof raw === "object") {
          const node = raw as JsonLdNode;
          const name = typeof node.name === "string" ? node.name : null;
          if (name && name !== "Home") names.push(name);
        }
      }
      for (let i = names.length - 1; i >= 0; i--) {
        const mapped = MICROCENTER_CATEGORY_MAP.get(names[i]!);
        if (mapped) return mapped;
      }
      if (names.length > 0) {
        // Known Micro Center category but no Tomame match
        return TomameCategory.OTHER;
      }
    }
  }
  // Fallback: data-category from ProductLink span
  if (productLinkCategory) {
    const mapped = MICROCENTER_CATEGORY_MAP.get(productLinkCategory);
    if (mapped) return mapped;
    return TomameCategory.OTHER;
  }
  return null;
}

export class MicrocenterScraper extends PlatformScraper {
  public readonly domains = ["microcenter.com"];

  /**
   * Keep /product/<id>/<slug> — drop query strings and tracking params.
   * The slug is part of the canonical URL so we preserve it if present.
   */
  private static cleanUrl(raw: string): string {
    try {
      const u = new URL(raw);
      return `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  public async scrape(url: string): Promise<ScrapedProduct> {
    const cleanedUrl = MicrocenterScraper.cleanUrl(url);

    // Micro Center sits behind Cloudflare. /chromium/unblock is purpose-built
    // for bot-protected pages and has a much higher pass rate than stealth /content.
    // The unblock variant doesn't include the ProductLink_* span or the
    // BreadcrumbList JSON-LD (so category is often null), but it does include
    // full JSON-LD Product data (name, image array, brand, price in offers)
    // which is everything we need to place an order.
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await this.browserless.unblockContent(cleanedUrl, 25000);

      if (result.success && result.html && MicrocenterScraper.looksLikeProductPage(result.html)) {
        const $ = cheerio.load(result.html);
        return this.extract($);
      }

      logger.warn("microcenter fetch did not return product page", {
        url: cleanedUrl,
        attempt,
        error: result.error,
        htmlLength: result.html?.length ?? 0,
      });
    }

    throw new Error("Failed to fetch Micro Center product page after retries");
  }

  /** Detect whether a response contains a real product page (not a CF challenge or partial error page). */
  private static looksLikeProductPage(html: string): boolean {
    // Product JSON-LD in any formatting (with or without whitespace/newlines)
    if (/"@type"\s*:\s*"Product"/.test(html)) return true;
    // Older/alternate layout still uses the ProductLink_* span
    if (html.includes("ProductLink_")) return true;
    return false;
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const jsonLd = parseJsonLd($);
    const product = findByType(jsonLd, "Product");
    const breadcrumb = findByType(jsonLd, "BreadcrumbList");

    const linkData = extractFromProductLink($);

    const title = (typeof product?.name === "string" ? product.name.trim() : null)
      ?? linkData.name
      ?? text($, "h2.productTi")
      ?? text($, "h1");

    const images = extractImages(product, $);
    let description = typeof product?.description === "string" ? product.description.trim() : null;
    if (!description) {
      description = $("meta[property='og:description']").attr("content")?.trim() || null;
    }

    let brand: string | null = null;
    if (product && typeof product.brand === "object" && product.brand !== null) {
      const b = (product.brand as JsonLdNode).name;
      if (typeof b === "string" && b.trim()) brand = b.trim();
    } else if (typeof product?.brand === "string" && product.brand.trim()) {
      brand = product.brand.trim();
    }
    if (!brand && linkData.brand) brand = linkData.brand;

    let price: number | null = linkData.price;
    let currency: string | null = null;
    const offers = product?.offers;
    if (offers && typeof offers === "object") {
      const offerNode = offers as JsonLdNode;
      const offerPrice = offerNode.price;
      if (price == null) {
        if (typeof offerPrice === "number") price = offerPrice;
        else if (typeof offerPrice === "string") {
          const parsed = parseFloat(offerPrice);
          if (Number.isFinite(parsed)) price = parsed;
        }
      }
      if (typeof offerNode.priceCurrency === "string") currency = offerNode.priceCurrency;
    }
    // Micro Center is USD-only
    if (!currency && price != null) currency = "USD";

    const specifications = extractSpecifications($);

    const sku = typeof product?.sku === "string" ? product.sku : null;
    const mpn = typeof product?.mpn === "string" ? product.mpn : null;

    const proxiedImages = images.map(proxyMicrocenterImage);

    return {
      title,
      image: proxiedImages[0] ?? null,
      price,
      currency,
      description,
      brand,
      category: mapCategory(breadcrumb, linkData.category),
      size: specifications["Size"] ?? null,
      weight: extractWeight(specifications),
      dimensions: extractDimensions(specifications),
      specifications,
      metadata: {
        images: proxiedImages,
        productId: linkData.id,
        sku,
        mpn,
        microcenterCategory: linkData.category,
      },
    };
  }
}

/** Singleton instance for direct use / tests */
export const microcenterScraper = new MicrocenterScraper(browserlessClient);
