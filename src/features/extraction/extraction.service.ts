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

// ── JSON-LD extraction ─────────────────────────────────────

function extractFromJsonLd($: cheerio.CheerioAPI): {
  name?: string;
  price?: number;
  currency?: string;
  image?: string;
} {
  const result: {
    name?: string;
    price?: number;
    currency?: string;
    image?: string;
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

// ── Meta/Title fallback extraction ─────────────────────────

function extractFromMetaTags($: cheerio.CheerioAPI): {
  title?: string;
} {
  const result: { title?: string } = {};

  const titleTag = $("title").first().text();
  if (titleTag) result.title = titleTag.trim();

  return result;
}

// ── Main extraction function ───────────────────────────────

export async function extractProductData(
  url: string,
): Promise<ServiceResult<ExtractionResult>> {
  const errors: string[] = [];
  let responseStatus: number | null = null;

  const emptyField: ExtractionField = {
    value: null,
    source: null,
    confidence: null,
  };
  const fields: ExtractionResult["fields"] = {
    name: { ...emptyField },
    price: { ...emptyField },
    image: { ...emptyField },
    country: { ...emptyField },
  };

  // Fetch the URL
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);
    responseStatus = response.status;

    if (!response.ok) {
      errors.push(`HTTP ${response.status}: ${response.statusText}`);
      return {
        success: true,
        data: {
          extractionAttempted: true,
          extractionSuccess: false,
          fields,
          errors,
          fetchedAt: new Date().toISOString(),
          responseStatus,
        },
      };
    }

    html = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    errors.push(`Fetch error: ${message}`);
    logger.error("extractProductData fetch failed", { url, error: message });

    return {
      success: true,
      data: {
        extractionAttempted: true,
        extractionSuccess: false,
        fields,
        errors,
        fetchedAt: new Date().toISOString(),
        responseStatus,
      },
    };
  }

  // Parse HTML
  const $ = cheerio.load(html);

  // 1. JSON-LD (highest priority)
  const jsonLd = extractFromJsonLd($);

  // 2. OG Meta
  const ogMeta = extractFromOgMeta($);

  // 3. Meta/Title fallback
  const metaTags = extractFromMetaTags($);

  // ── Name ─────────────────────────────────────────────────
  if (jsonLd.name) {
    fields.name = { value: jsonLd.name, source: "json_ld", confidence: "high" };
  } else if (ogMeta.title) {
    fields.name = {
      value: ogMeta.title,
      source: "og_meta",
      confidence: "medium",
    };
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
  }

  // ── Image ────────────────────────────────────────────────
  if (jsonLd.image) {
    fields.image = {
      value: jsonLd.image,
      source: "json_ld",
      confidence: "high",
    };
  } else if (ogMeta.image) {
    fields.image = {
      value: ogMeta.image,
      source: "og_meta",
      confidence: "medium",
    };
  }

  // ── Country (domain mapping) ─────────────────────────────
  const countryMapping = getCountryFromDomain(url);
  if (countryMapping) {
    fields.country = {
      value: countryMapping.country,
      source: "domain_mapping",
      confidence: "high",
    };
  }

  // Determine overall success (at least name OR price extracted)
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
      fields,
      errors,
      fetchedAt: new Date().toISOString(),
      responseStatus,
    },
  };
}
