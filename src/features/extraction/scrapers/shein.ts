import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { PlatformScraper, type ScrapedProduct } from "./types";
import { browserlessClient } from "@/lib/browserless/client";
import { TomameCategory, SHEIN_CATEGORY_MAP } from "@/config/categories";
import { scrapeSheinWithApify, type ApifySheinProduct } from "@/lib/apify/client";

type JsonLdNode = Record<string, unknown>;

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim().replace(/\s+/g, " ");
  return t || null;
}

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

function extractGoodsIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/-p-(\d+)(?:-cat-\d+)?\.html/i);
    if (m?.[1]) return m[1];
  } catch {
    // ignore
  }
  return null;
}

function extractGoodsId($: CheerioAPI): string | null {
  const canonical = $("link[rel='canonical']").attr("href")
    ?? $("meta[property='og:url']").attr("content");
  if (canonical) {
    const fromUrl = extractGoodsIdFromUrl(canonical);
    if (fromUrl) return fromUrl;
  }
  const meta = $("meta[itemprop='productID']").attr("content")
    ?? $("meta[property='og:product:retailer_item_id']").attr("content")
    ?? $("meta[property='product:retailer_item_id']").attr("content");
  if (meta) {
    const m = meta.match(/(\d{6,})/);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractPriceFromOffers(product: JsonLdNode | null): { price: number | null; currency: string | null } {
  if (!product) return { price: null, currency: null };
  const offers = product.offers;
  if (!offers || typeof offers !== "object") return { price: null, currency: null };

  const node = (Array.isArray(offers) ? offers[0] : offers) as JsonLdNode;
  let price: number | null = null;
  const raw = node.price ?? node.lowPrice;
  if (typeof raw === "number") price = raw;
  else if (typeof raw === "string") {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) price = parsed;
  }
  const currency = typeof node.priceCurrency === "string" ? node.priceCurrency : null;
  return { price, currency };
}

function extractImagesFromJsonLd(product: JsonLdNode | null): string[] {
  if (!product) return [];
  const images: string[] = [];
  const img = product.image;
  if (typeof img === "string") images.push(img);
  else if (Array.isArray(img)) {
    for (const i of img) if (typeof i === "string" && !images.includes(i)) images.push(i);
  }
  return images;
}

function extractGalleryImages($: CheerioAPI): string[] {
  const images: string[] = [];
  $(".product-intro__thumbs img, .product-intro__main-img img, .gallery-img img, [class*='product-intro'] img")
    .each((_, el) => {
      const src = $(el).attr("data-src") ?? $(el).attr("src");
      if (!src) return;
      const cleaned = src.split("?")[0] ?? src;
      if (cleaned && !images.includes(cleaned)) images.push(cleaned);
    });
  return images;
}

function extractTitle(product: JsonLdNode | null, $: CheerioAPI): string | null {
  if (typeof product?.name === "string" && product.name.trim()) return product.name.trim();
  const og = $("meta[property='og:title']").attr("content")?.trim();
  if (og) return og;
  return text($, "h1.product-intro__head-name")
    ?? text($, "h1[class*='product-intro__head']")
    ?? text($, "h1");
}

function extractDescription(product: JsonLdNode | null, $: CheerioAPI): string | null {
  const fromLd = typeof product?.description === "string" ? product.description.trim() : null;
  if (fromLd) return fromLd;
  const og = $("meta[property='og:description']").attr("content")?.trim();
  if (og) return og;
  return text($, ".product-intro__description, [class*='product-intro__description']");
}

function extractBrand(product: JsonLdNode | null, specs: Record<string, string>): string | null {
  if (product) {
    if (typeof product.brand === "string" && product.brand.trim()) return product.brand.trim();
    if (typeof product.brand === "object" && product.brand !== null) {
      const b = (product.brand as JsonLdNode).name;
      if (typeof b === "string" && b.trim()) return b.trim();
    }
  }
  return specs["Brand"] ?? specs["Brand Name"] ?? null;
}

function extractSpecifications($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  $(".product-intro__description-table-item, .product-intro__description tr, .product-attr-list li")
    .each((_, el) => {
      const $el = $(el);
      const label = $el.find(".product-intro__description-table-key, .key, .label, dt, th, strong").first()
        .text().trim().replace(/:$/, "").trim();
      const value = $el.find(".product-intro__description-table-val, .val, .value, dd, td").first()
        .text().trim().replace(/\s+/g, " ");
      if (label && value) specs[label] = value;
    });

  $(".product-intro__description dl, .description-content dl").each((_, dl) => {
    $(dl).find("dt").each((_, dt) => {
      const key = $(dt).text().trim().replace(/:$/, "").trim();
      const value = $(dt).next("dd").text().trim().replace(/\s+/g, " ");
      if (key && value && !specs[key]) specs[key] = value;
    });
  });

  return specs;
}

function extractCategoryFromBreadcrumb($: CheerioAPI, jsonLd: JsonLdNode[]): TomameCategory | null {
  const breadcrumb = findByType(jsonLd, "BreadcrumbList");
  if (breadcrumb) {
    const items = breadcrumb.itemListElement;
    if (Array.isArray(items)) {
      const names: string[] = [];
      for (const raw of items) {
        if (raw && typeof raw === "object") {
          const node = raw as JsonLdNode;
          const name = typeof node.name === "string" ? node.name : null;
          if (name && name !== "Home" && name !== "SHEIN") names.push(name);
        }
      }
      for (const n of names) {
        const mapped = SHEIN_CATEGORY_MAP.get(n);
        if (mapped) return mapped;
      }
      if (names.length > 0) return TomameCategory.OTHER;
    }
  }

  const crumbs: string[] = [];
  $(".bread-crumbs a, .breadcrumb a, nav[aria-label='Breadcrumb'] a, [class*='breadcrumb'] a")
    .each((_, el) => {
      const t = $(el).text().trim();
      if (t && t !== "Home" && t !== "SHEIN") crumbs.push(t);
    });
  for (const c of crumbs) {
    const mapped = SHEIN_CATEGORY_MAP.get(c);
    if (mapped) return mapped;
  }
  if (crumbs.length > 0) return TomameCategory.OTHER;

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
    if (/\bdimensions?\b|\bsize\b|\bmeasurement/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function extractAvailableSizes($: CheerioAPI): string[] {
  const sizes: string[] = [];
  $(".product-intro__size-radio span, .size-list li, [class*='product-intro__size'] [class*='size-radio']")
    .each((_, el) => {
      const t = $(el).text().trim();
      if (t && t.length <= 12 && !sizes.includes(t)) sizes.push(t);
    });
  return sizes;
}

function extractSelectedSize($: CheerioAPI): string | null {
  return text($, ".product-intro__size-radio.active, [class*='product-intro__size'].active, .size-list li.active");
}

function toHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http://")) return `https://${url.slice(7)}`;
  return url;
}

function priceUsd(p: unknown): number | null {
  if (!p || typeof p !== "object") return null;
  const node = p as { usd_amount?: unknown; amount?: unknown };
  for (const candidate of [node.usd_amount, node.amount]) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string") {
      const parsed = parseFloat(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function mapApifyToScrapedProduct(item: ApifySheinProduct): ScrapedProduct {
  const specs: Record<string, string> = {};
  if (item.brand) specs["Brand"] = item.brand;
  if (item.color) specs["Color"] = item.color;
  if (item.sku) specs["SKU"] = String(item.sku);

  const crumbs: string[] = [];
  if (Array.isArray(item.breadcrumbs)) {
    for (const c of item.breadcrumbs) {
      if (typeof c === "string") crumbs.push(c);
      else if (c?.name) crumbs.push(c.name);
      else if (c?.text) crumbs.push(c.text);
    }
  }
  if (Array.isArray(item.category_path)) crumbs.push(...item.category_path);
  if (typeof item.category === "string") crumbs.push(item.category);

  let category: TomameCategory | null = null;
  for (const c of crumbs) {
    const mapped = SHEIN_CATEGORY_MAP.get(c);
    if (mapped) { category = mapped; break; }
  }
  if (!category && crumbs.length > 0) category = TomameCategory.OTHER;

  const images = (item.images ?? []).map((u) => toHttps(u)).filter((u): u is string => !!u);
  const mainImage = toHttps(item.main_image) ?? images[0] ?? null;

  const price = priceUsd(item.sale_price) ?? priceUsd(item.retail_price);
  const currency = (item.sale_price?.currency ?? item.retail_price?.currency)
    ?? (price != null ? "USD" : null);

  const goodsId = item.goods_id ?? item.product_id ?? null;

  const availableSizes: string[] = [];
  if (Array.isArray(item.sizes)) {
    for (const s of item.sizes) {
      const name = s?.attr_value_name_en ?? s?.attr_value_name;
      if (name && !availableSizes.includes(name)) availableSizes.push(name);
    }
  }
  const size = availableSizes.length === 1 ? availableSizes[0]! : null;

  return {
    title: item.title ?? null,
    image: mainImage,
    price,
    currency,
    description: item.description ?? null,
    brand: item.brand ?? null,
    category,
    size,
    weight: null,
    dimensions: null,
    specifications: specs,
    metadata: {
      images,
      goodsId: goodsId != null ? String(goodsId) : null,
      sku: item.sku ?? null,
      availableSizes,
      color: item.color ?? null,
      hasDiscount: item.has_discount ?? null,
      discountPercentage: item.discount_percentage ?? null,
      rating: item.rating ?? null,
      reviewCount: item.review_count ?? null,
      source: "apify",
    },
  };
}

export class SheinScraper extends PlatformScraper {
  public readonly domains = [
    "shein.com",
    "us.shein.com",
    "m.shein.com",
  ];

  // Pin to us.shein.com so locale stays English/USD regardless of scraper proxy region.
  private static cleanUrl(raw: string): string {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      if (host === "m.shein.com" || host === "www.shein.com" || host === "shein.com") {
        u.hostname = "us.shein.com";
      }
      return `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  public async scrape(url: string): Promise<ScrapedProduct> {
    const cleanedUrl = SheinScraper.cleanUrl(url);

    const result = await scrapeSheinWithApify(cleanedUrl);
    if (result) return mapApifyToScrapedProduct(result);

    throw new Error("Failed to fetch SHEIN product page via Apify");
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const jsonLd = parseJsonLd($);
    const product = findByType(jsonLd, "Product");
    const { price, currency: ldCurrency } = extractPriceFromOffers(product);

    let currency = ldCurrency;
    if (!currency) {
      currency = $("meta[property='og:price:currency']").attr("content")?.trim()
        ?? $("meta[property='product:price:currency']").attr("content")?.trim()
        ?? $("meta[itemprop='priceCurrency']").attr("content")?.trim()
        ?? null;
    }

    let finalPrice = price;
    if (finalPrice == null) {
      const ogPrice = $("meta[property='og:price:amount']").attr("content")
        ?? $("meta[property='product:price:amount']").attr("content");
      if (ogPrice) {
        const parsed = parseFloat(ogPrice);
        if (Number.isFinite(parsed)) finalPrice = parsed;
      }
    }

    const ldImages = extractImagesFromJsonLd(product);
    const galleryImages = extractGalleryImages($);
    const allImages: string[] = [];
    for (const img of [...ldImages, ...galleryImages]) {
      const upgraded = toHttps(img);
      if (upgraded && !allImages.includes(upgraded)) allImages.push(upgraded);
    }
    const mainImage = toHttps(
      ldImages[0] ?? $("meta[property='og:image']").attr("content") ?? galleryImages[0] ?? null,
    );

    const specifications = extractSpecifications($);
    const availableSizes = extractAvailableSizes($);

    return {
      title: extractTitle(product, $),
      image: mainImage,
      price: finalPrice,
      currency,
      description: extractDescription(product, $),
      brand: extractBrand(product, specifications),
      category: extractCategoryFromBreadcrumb($, jsonLd),
      size: extractSelectedSize($) ?? specifications["Size"] ?? null,
      weight: extractWeight(specifications),
      dimensions: extractDimensions(specifications),
      specifications,
      metadata: {
        images: allImages,
        goodsId: extractGoodsId($),
        sku: typeof product?.sku === "string" ? product.sku : null,
        mpn: typeof product?.mpn === "string" ? product.mpn : null,
        availableSizes,
        rating: text($, ".product-intro__head-rate, [class*='rate-num']"),
        reviewCount: text($, ".product-intro__head-reviews, [class*='review-count']"),
      },
    };
  }
}

export const sheinScraper = new SheinScraper(browserlessClient);
