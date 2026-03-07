import * as cheerio from "cheerio";
import type { ServiceResult } from "@/types/domain";
import { logger } from "@/lib/logger";
import { JsonLdProduct, ExtractionResult, ExtractionField } from "./types";

// ── Domain → Country mapping ───────────────────────────────

const DOMAIN_COUNTRY_MAP: Record<string, "USA" | "UK" | "CHINA"> = {
  "amazon.com": "USA",
  "ebay.com": "USA",
  "walmart.com": "USA",
  "target.com": "USA",
  "bestbuy.com": "USA",
  "amazon.co.uk": "UK",
  "ebay.co.uk": "UK",
  "argos.co.uk": "UK",
  "aliexpress.com": "CHINA",
  "alibaba.com": "CHINA",
  "temu.com": "CHINA",
  "shein.com": "CHINA",
};

function getCountryFromDomain(
  url: string,
): { country: "USA" | "UK" | "CHINA"; domain: string } | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [domain, country] of Object.entries(DOMAIN_COUNTRY_MAP)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return { country, domain };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Unit code → human-readable label ───────────────────────

function unitCodeToLabel(code?: string): string {
  if (!code) return "";
  const map: Record<string, string> = {
    KGM: "kg", GRM: "g", LBR: "lbs", OZS: "oz",
    CMT: "cm", MTR: "m", INH: "in", FTH: "ft",
    MLT: "mL", LTR: "L", FOZ: "fl oz",
  };
  return map[code] ?? code;
}

function formatQuantitativeValue(
  qv: { value?: string | number; unitCode?: string; unitText?: string } | string | undefined,
): string | null {
  if (!qv) return null;
  if (typeof qv === "string") return qv.trim() || null;
  const { value, unitCode, unitText } = qv;
  if (value === undefined) return null;
  const unit = unitText ?? unitCodeToLabel(unitCode);
  return unit ? `${value} ${unit}` : String(value);
}

// ── JSON-LD extraction ─────────────────────────────────────

function extractFromJsonLd($: cheerio.CheerioAPI): {
  name?: string;
  price?: number;
  currency?: string;
  image?: string;
  weight?: string;
  dimensions?: string;
  volume?: string;
} {
  const result: {
    name?: string;
    price?: number;
    currency?: string;
    image?: string;
    weight?: string;
    dimensions?: string;
    volume?: string;
  } = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).html();
      if (!text) return;
      const data = JSON.parse(text);

      // Handle both single objects and arrays of objects
      const items: unknown[] = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const typed = item as JsonLdProduct & {
          "@type"?: string | string[];
          "@graph"?: unknown[];
        };

        // Check @graph for nested Product types
        if (typed["@graph"] && Array.isArray(typed["@graph"])) {
          items.push(...typed["@graph"]);
          continue;
        }

        const type = typed["@type"];
        const isProduct =
          type === "Product" ||
          (Array.isArray(type) && type.includes("Product"));

        if (!isProduct) continue;

        if (typed.name && !result.name) {
          result.name = String(typed.name).trim();
        }

        if (typed.image && !result.image) {
          if (typeof typed.image === "string") {
            result.image = typed.image;
          } else if (Array.isArray(typed.image)) {
            result.image = String(typed.image[0]);
          } else if (typeof typed.image === "object" && typed.image.url) {
            result.image = typed.image.url;
          }
        }

        if (typed.offers && result.price === undefined) {
          const offer = Array.isArray(typed.offers)
            ? typed.offers[0]
            : typed.offers;
          if (offer?.price !== undefined) {
            const parsed = parseFloat(String(offer.price));
            if (!isNaN(parsed)) {
              result.price = parsed;
              result.currency = offer.priceCurrency ?? undefined;
            }
          }
        }

        if (typed.weight && !result.weight) {
          const w = formatQuantitativeValue(typed.weight);
          if (w) result.weight = w;
        }

        if (!result.dimensions) {
          const d = formatQuantitativeValue(typed.depth);
          const h = formatQuantitativeValue(typed.height);
          const w = formatQuantitativeValue(typed.width);
          const parts = [d, h, w].filter(Boolean);
          if (parts.length === 3) result.dimensions = parts.join(" x ");
          else if (parts.length > 0) result.dimensions = parts.join(" x ");
        }

        if (typed.size && !result.dimensions) {
          const s = typeof typed.size === "string"
            ? typed.size.trim()
            : (typed.size as { name?: string }).name?.trim();
          if (s) {
            // Liquid measure → volume
            if (/\d.*(ml|l\b|oz|litre|liter)/i.test(s)) {
              if (!result.volume) result.volume = s;
            } else if (/\d/.test(s)) {
              // Looks like a measurement (contains a digit) → dimensions
              result.dimensions = s;
            }
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  });

  return result;
}

// ── OG Meta extraction ─────────────────────────────────────

function extractFromOgMeta($: cheerio.CheerioAPI): {
  title?: string;
  image?: string;
  price?: number;
  currency?: string;
} {
  const result: {
    title?: string;
    image?: string;
    price?: number;
    currency?: string;
  } = {};

  const ogTitle = $('meta[property="og:title"]').attr("content");
  if (ogTitle) result.title = ogTitle.trim();

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) result.image = ogImage;

  const ogPrice = $('meta[property="og:price:amount"]').attr("content");
  if (ogPrice) {
    const parsed = parseFloat(ogPrice);
    if (!isNaN(parsed)) result.price = parsed;
  }

  const ogCurrency = $('meta[property="og:price:currency"]').attr("content");
  if (ogCurrency) result.currency = ogCurrency;

  return result;
}

// ── Microdata (itemprop) extraction ───────────────────────

function extractFromMicrodata($: cheerio.CheerioAPI): {
  name?: string;
  price?: number;
  currency?: string;
  image?: string;
  weight?: string;
  dimensions?: string;
  volume?: string;
} {
  const result: {
    name?: string;
    price?: number;
    currency?: string;
    image?: string;
    weight?: string;
    dimensions?: string;
    volume?: string;
  } = {};

  // Product name via itemprop="name" inside a product context
  const nameEl = $('[itemprop="name"]').first();
  if (nameEl.length) {
    const text = nameEl.attr("content") || nameEl.text();
    if (text?.trim()) result.name = text.trim();
  }

  // Price via itemprop="price"
  const priceEl = $('[itemprop="price"]').first();
  if (priceEl.length) {
    const raw = priceEl.attr("content") || priceEl.text();
    if (raw) {
      const parsed = parseFloat(raw.replace(/[^0-9.]/g, ""));
      if (!isNaN(parsed) && parsed > 0) result.price = parsed;
    }
  }

  // Currency via itemprop="priceCurrency"
  const currencyEl = $('[itemprop="priceCurrency"]').first();
  if (currencyEl.length) {
    result.currency = currencyEl.attr("content") || currencyEl.text() || undefined;
  }

  // Image via itemprop="image"
  const imageEl = $('[itemprop="image"]').first();
  if (imageEl.length) {
    const src = imageEl.attr("src") || imageEl.attr("content") || imageEl.attr("href");
    if (src) result.image = src;
  }

  // Weight via itemprop="weight"
  const weightEl = $('[itemprop="weight"]').first();
  if (weightEl.length) {
    const val = weightEl.attr("content") || weightEl.text().trim();
    if (val) result.weight = val;
  }

  // Dimensions from depth/height/width itemprop
  const depth = $('[itemprop="depth"]').first().attr("content") || $('[itemprop="depth"]').first().text().trim();
  const height = $('[itemprop="height"]').first().attr("content") || $('[itemprop="height"]').first().text().trim();
  const width = $('[itemprop="width"]').first().attr("content") || $('[itemprop="width"]').first().text().trim();
  const dimParts = [depth, height, width].filter(Boolean);
  if (dimParts.length > 0) result.dimensions = dimParts.join(" x ");

  // Volume via additionalProperty itemprop
  $('[itemprop="additionalProperty"]').each((_, el) => {
    const propName = $(el).find('[itemprop="name"]').text().trim().toLowerCase();
    const propValue = $(el).find('[itemprop="value"]').text().trim();
    if (!propValue) return;
    if (/\bvolume\b|\bcapacity\b/.test(propName) && !result.volume) result.volume = propValue;
    if (/\bweight\b/.test(propName) && !result.weight) result.weight = propValue;
    if (/\bdimensions?\b|\bsize\b/.test(propName) && !result.dimensions) result.dimensions = propValue;
  });

  return result;
}

// ── DOM selector extraction (site-specific patterns) ──────

function extractFromDomSelectors($: cheerio.CheerioAPI, url: string): {
  price?: number;
  currency?: string;
  image?: string;
  weight?: string;
  dimensions?: string;
  volume?: string;
} {
  const result: {
    price?: number;
    currency?: string;
    image?: string;
    weight?: string;
    dimensions?: string;
    volume?: string;
  } = {};
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return result;
  }

  // ── Price selectors ──────────────────────────────────────

  // Amazon-specific price selectors
  if (hostname.includes("amazon")) {
    const priceSelectors = [
      ".a-price .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      ".priceToPay .a-offscreen",
      "#corePrice_feature_div .a-offscreen",
      "span.a-color-price",
    ];
    for (const sel of priceSelectors) {
      const text = $(sel).first().text().trim();
      if (text) {
        const parsed = parseFloat(text.replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          result.price = parsed;
          result.currency = text.startsWith("£") ? "GBP" : "USD";
          break;
        }
      }
    }
  }

  // eBay-specific
  if (hostname.includes("ebay")) {
    const priceSelectors = [
      ".x-price-primary span.ux-textspans",
      "#prcIsum",
      '[data-testid="x-price-primary"] span',
      ".vi-price .notranslate",
    ];
    for (const sel of priceSelectors) {
      const text = $(sel).first().text().trim();
      if (text) {
        const parsed = parseFloat(text.replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          result.price = parsed;
          result.currency = text.startsWith("£") ? "GBP" : "USD";
          break;
        }
      }
    }
  }

  // AliExpress / Temu / Shein
  if (hostname.includes("aliexpress") || hostname.includes("temu") || hostname.includes("shein")) {
    const priceSelectors = [
      '[class*="product-price"]',
      '[class*="Price"]',
      ".product-price-value",
      ".uniform-banner-box-price",
    ];
    for (const sel of priceSelectors) {
      const text = $(sel).first().text().trim();
      if (text) {
        const parsed = parseFloat(text.replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          result.price = parsed;
          result.currency = "USD";
          break;
        }
      }
    }
  }

  // Generic price fallback (try common class/attribute patterns)
  if (result.price === undefined) {
    const genericPriceSelectors = [
      '[data-testid="price"]',
      '[class*="price" i]:not(style):not(script)',
      ".product-price",
      ".current-price",
      ".sale-price",
    ];
    for (const sel of genericPriceSelectors) {
      const el = $(sel).first();
      const text = el.text().trim();
      if (text) {
        // Match a price-like pattern: optional currency symbol + digits with decimals
        const match = text.match(/[$£€¥]\s?([\d,]+\.?\d*)/);
        if (match) {
          const parsed = parseFloat(match[1]!.replace(/,/g, ""));
          if (!isNaN(parsed) && parsed > 0) {
            result.price = parsed;
            if (text.includes("£")) result.currency = "GBP";
            else if (text.includes("€")) result.currency = "EUR";
            else if (text.includes("¥")) result.currency = "CNY";
            else result.currency = "USD";
            break;
          }
        }
      }
    }
  }

  // ── Image selectors ──────────────────────────────────────

  // Amazon-specific image
  if (hostname.includes("amazon")) {
    const imgSelectors = ["#landingImage", "#imgBlkFront", "#main-image"];
    for (const sel of imgSelectors) {
      const src = $(sel).attr("src") || $(sel).attr("data-old-hires");
      if (src && src.startsWith("http")) {
        result.image = src;
        break;
      }
    }
  }

  // eBay-specific image
  if (hostname.includes("ebay") && !result.image) {
    const src = $(".ux-image-carousel-item img").first().attr("src")
      || $('[data-testid="ux-image-carousel"] img').first().attr("src");
    if (src && src.startsWith("http")) result.image = src;
  }

  // Generic image fallback
  if (!result.image) {
    const genericImgSelectors = [
      '[data-testid="product-image"] img',
      ".product-image img",
      ".gallery-image img",
      "#product-image img",
    ];
    for (const sel of genericImgSelectors) {
      const src = $(sel).first().attr("src");
      if (src && src.startsWith("http")) {
        result.image = src;
        break;
      }
    }
  }

  // ── Spec table extraction (weight, dimensions, volume) ──

  if (hostname.includes("amazon")) {
    const specRows = $(
      "#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, .prodDetTable tr",
    );
    specRows.each((_, row) => {
      const label = $(row).find("th, .label").text().trim().toLowerCase();
      const value = $(row).find("td, .value").text().trim().replace(/\s+/g, " ");
      if (!value || !label) return;
      if (!result.weight && /item\s*weight|weight/.test(label)) result.weight = value;
      if (!result.dimensions && /dimensions?|size/.test(label)) result.dimensions = value;
      if (!result.volume && /volume|capacity|fluid/.test(label)) result.volume = value;
    });
  }

  // Generic: look for spec/detail rows on any site
  if (!result.weight || !result.dimensions) {
    $(
      '.product-specs tr, .product-details tr, [class*="spec"] tr, [class*="detail"] tr',
    ).each((_, row) => {
      const cells = $(row).find("td, th");
      if (cells.length < 2) return;
      const label = cells.first().text().trim().toLowerCase();
      const value = cells.last().text().trim().replace(/\s+/g, " ");
      if (!value) return;
      if (!result.weight && /\bweight\b/.test(label)) result.weight = value;
      if (!result.dimensions && /\bdimensions?\b|\bsize\b/.test(label)) result.dimensions = value;
      if (!result.volume && /\bvolume\b|\bcapacity\b/.test(label)) result.volume = value;
    });
  }

  return result;
}

// ── Meta/Title fallback extraction ─────────────────────────

function extractFromMetaTags($: cheerio.CheerioAPI): {
  title?: string;
  image?: string;
  price?: number;
  currency?: string;
} {
  const result: { title?: string; image?: string; price?: number; currency?: string } = {};

  const titleTag = $("title").first().text();
  if (titleTag) result.title = titleTag.trim();

  // twitter:image meta tag (many sites include this)
  const twitterImage = $('meta[name="twitter:image"]').attr("content")
    || $('meta[property="twitter:image"]').attr("content");
  if (twitterImage) result.image = twitterImage;

  // product:price:amount (Facebook product meta)
  const productPrice = $('meta[property="product:price:amount"]').attr("content");
  if (productPrice) {
    const parsed = parseFloat(productPrice);
    if (!isNaN(parsed) && parsed > 0) result.price = parsed;
  }

  const productCurrency = $('meta[property="product:price:currency"]').attr("content");
  if (productCurrency) result.currency = productCurrency;

  return result;
}

// ── Parse HTML (pure function — shared by fetch and Puppeteer paths) ──

function parseHtml(
  html: string,
  url: string,
): ExtractionResult["fields"] {
  const emptyField: ExtractionField = { value: null, source: null, confidence: null };
  const fields: ExtractionResult["fields"] = {
    name: { ...emptyField },
    price: { ...emptyField },
    image: { ...emptyField },
    country: { ...emptyField },
    platform: { ...emptyField },
    currency: { ...emptyField },
    weight: { ...emptyField },
    dimensions: { ...emptyField },
    volume: { ...emptyField },
  };

  const $ = cheerio.load(html);

  // 1. JSON-LD (highest priority)
  const jsonLd = extractFromJsonLd($);

  // 2. OG Meta
  const ogMeta = extractFromOgMeta($);

  // 3. Microdata (itemprop attributes)
  const microdata = extractFromMicrodata($);

  // 4. DOM selectors (site-specific patterns)
  const domData = extractFromDomSelectors($, url);

  // 5. Meta/Title fallback
  const metaTags = extractFromMetaTags($);

  // ── Name ─────────────────────────────────────────────────
  if (jsonLd.name) {
    fields.name = { value: jsonLd.name, source: "json_ld", confidence: "high" };
  } else if (ogMeta.title) {
    fields.name = { value: ogMeta.title, source: "og_meta", confidence: "medium" };
  } else if (metaTags.title) {
    fields.name = {
      value: metaTags.title,
      source: "meta_tag",
      confidence: "low",
    };
  }

  // ── Price ────────────────────────────────────────────────
  if (jsonLd.price !== undefined) {
    fields.price = {
      value: jsonLd.price,
      source: "json_ld",
      confidence: "high",
      currency: jsonLd.currency,
    };
  } else if (ogMeta.price !== undefined) {
    fields.price = {
      value: ogMeta.price,
      source: "og_meta",
      confidence: "medium",
      currency: ogMeta.currency,
    };
  } else if (microdata.price !== undefined) {
    fields.price = {
      value: microdata.price,
      source: "meta_tag",
      confidence: "medium",
      currency: microdata.currency,
    };
  } else if (domData.price !== undefined) {
    fields.price = {
      value: domData.price,
      source: "dom_selector",
      confidence: "low",
      currency: domData.currency,
    };
  } else if (metaTags.price !== undefined) {
    fields.price = {
      value: metaTags.price,
      source: "meta_tag",
      confidence: "low",
      currency: metaTags.currency,
    };
  }

  // ── Image ────────────────────────────────────────────────
  if (jsonLd.image) {
    fields.image = {
      value: jsonLd.image,
      source: "json_ld",
      confidence: "high",
    };
  } else if (ogMeta.image) {
    fields.image = { value: ogMeta.image, source: "og_meta", confidence: "medium" };
  }

  // ── Country + Platform (domain mapping) ─────────────────
  const countryMapping = getCountryFromDomain(url);
  if (countryMapping) {
    fields.country = {
      value: countryMapping.country,
      source: "domain_mapping",
      confidence: "high",
    };
    fields.platform = {
      value: countryMapping.domain,
      source: "domain_mapping",
      confidence: "high",
    };
  }

  // ── Currency (mirrors price.currency as a top-level field) ─
  const priceCurrency = (fields.price as ExtractionField & { currency?: string }).currency;
  if (priceCurrency) {
    fields.currency = {
      value: priceCurrency,
      source: fields.price.source,
      confidence: fields.price.confidence,
    };
  }

  // ── Weight ───────────────────────────────────────────────
  if (jsonLd.weight) {
    fields.weight = { value: jsonLd.weight, source: "json_ld", confidence: "high" };
  } else if (microdata.weight) {
    fields.weight = { value: microdata.weight, source: "meta_tag", confidence: "medium" };
  } else if (domData.weight) {
    fields.weight = { value: domData.weight, source: "dom_selector", confidence: "medium" };
  }

  // ── Dimensions ───────────────────────────────────────────
  if (jsonLd.dimensions) {
    fields.dimensions = { value: jsonLd.dimensions, source: "json_ld", confidence: "high" };
  } else if (microdata.dimensions) {
    fields.dimensions = { value: microdata.dimensions, source: "meta_tag", confidence: "medium" };
  } else if (domData.dimensions) {
    fields.dimensions = { value: domData.dimensions, source: "dom_selector", confidence: "medium" };
  }

  // ── Volume ───────────────────────────────────────────────
  if (jsonLd.volume) {
    fields.volume = { value: jsonLd.volume, source: "json_ld", confidence: "high" };
  } else if (microdata.volume) {
    fields.volume = { value: microdata.volume, source: "meta_tag", confidence: "medium" };
  } else if (domData.volume) {
    fields.volume = { value: domData.volume, source: "dom_selector", confidence: "medium" };
  }

  return fields;
}

// ── Merge fields (Puppeteer fills gaps left by fetch) ───────

function mergeFields(
  fetchFields: ExtractionResult["fields"],
  puppeteerFields: ExtractionResult["fields"],
): ExtractionResult["fields"] {
  const merged = { ...fetchFields };

  for (const key of ["name", "price", "image", "country", "platform", "currency", "weight", "dimensions", "volume"] as const) {
    if (merged[key].value === null && puppeteerFields[key].value !== null) {
      merged[key] = puppeteerFields[key];
    }
  }

  return merged;
}

// ── Puppeteer-based renderer (not yet implemented) ─────────

async function fetchRenderedHtml(url: string): Promise<string> {
  // TODO: integrate a headless browser (e.g. Puppeteer) for JS-rendered pages
  throw new Error(`Rendered HTML fetching not implemented for: ${url}`);
}

// ── Main extraction function ───────────────────────────────

export interface ExtractProductOptions {
  forcePuppeteer?: boolean;
}

export async function extractProductData(
  url: string,
  options?: ExtractProductOptions,
): Promise<ServiceResult<ExtractionResult>> {
  const errors: string[] = [];
  let responseStatus: number | null = null;
  let usedPuppeteer = false;

  const emptyField: ExtractionField = { value: null, source: null, confidence: null };
  let fields: ExtractionResult["fields"] = {
    name: { ...emptyField },
    price: { ...emptyField },
    image: { ...emptyField },
    country: { ...emptyField },
    platform: { ...emptyField },
    currency: { ...emptyField },
    weight: { ...emptyField },
    dimensions: { ...emptyField },
    volume: { ...emptyField },
  };

  // ── Step 1: Fast path — fetch() + Cheerio ────────────────
  let fetchFailed = false;

  if (!options?.forcePuppeteer) {
    let html: string | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        redirect: "follow",
      });

      clearTimeout(timeout);
      responseStatus = response.status;

      if (!response.ok) {
        errors.push(`HTTP ${response.status}: ${response.statusText}`);
        fetchFailed = true;
      } else {
        html = await response.text();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fetch failed";
      errors.push(`Fetch error: ${message}`);
      logger.error("extractProductData fetch failed", { url, error: message });
      fetchFailed = true;
    }

    if (html) {
      fields = parseHtml(html, url);
    }

  }

  // ── Step 2: Check if Puppeteer fallback is needed ────────
  const missingFields = (
    ["name", "price", "image", "weight", "dimensions", "volume", "currency"] as const
  ).filter((key) => fields[key].value === null);

  const needsPuppeteer = options?.forcePuppeteer || missingFields.length > 0;

  if (needsPuppeteer) {
    logger.info("Puppeteer fallback triggered", {
      url,
      reason: options?.forcePuppeteer ? "forced" : `missing ${missingFields.join(", ")}`,
      fetchFailed,
    });

    try {
      const renderedHtml = await fetchRenderedHtml(url);
      const puppeteerFields = parseHtml(renderedHtml, url);
      fields = mergeFields(fields, puppeteerFields);
      usedPuppeteer = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Puppeteer failed";
      errors.push(`Puppeteer error: ${message}`);
      logger.error("extractProductData puppeteer fallback failed", {
        url,
        error: message,
      });
    }
  }

  // ── Step 3: Return result ────────────────────────────────
  const extractionSuccess =
    fields.name.value !== null || fields.price.value !== null;

  if (!extractionSuccess) {
    errors.push("Could not extract product name or price from page");
  }

  return {
    success: true,
    data: {
      extractionAttempted: true,
      extractionSuccess,
      usedPuppeteer,
      fields,
      errors,
      fetchedAt: new Date().toISOString(),
      responseStatus,
    },
  };
}
