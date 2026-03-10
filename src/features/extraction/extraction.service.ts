import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { resolvePlatform, getScraperByPlatform } from "./scrapers";
import type { ExtractionResult } from "./types";

const DOMAIN_COUNTRY_MAP: Record<string, "USA" | "UK" | "CHINA"> = {
  "amazon.com": "USA",
  "amazon.ca": "USA",
  "amazon.co.uk": "UK",
  "amazon.de": "UK",
  "amazon.fr": "UK",
  "amazon.es": "UK",
  "amazon.it": "UK",
  "amazon.com.au": "USA",
  "amazon.in": "CHINA",
  "amazon.co.jp": "CHINA",
  "a.co": "USA",
  "ebay.com": "USA",
  "ebay.co.uk": "UK",
  "walmart.com": "USA",
  "target.com": "USA",
  "bestbuy.com": "USA",
  "argos.co.uk": "UK",
  "aliexpress.com": "CHINA",
  "alibaba.com": "CHINA",
  "temu.com": "CHINA",
  "shein.com": "CHINA",
};

function getCountryFromDomain(url: string): "USA" | "UK" | "CHINA" | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [domain, country] of Object.entries(DOMAIN_COUNTRY_MAP)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return country;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function extractProductData(url: string): Promise<ExtractionResult> {
  const errors: string[] = [];

  const platform = resolvePlatform(url);
  if (!platform) {
    throw new APIError(400, "Unsupported platform");
  }

  const scraper = getScraperByPlatform(platform);

  try {
    const product = await scraper.scrape(url);

    const extractionSuccess = product.title !== null || product.price !== null;
    if (!extractionSuccess) {
      errors.push("Could not extract product name or price from page");
    }

    return {
      extractionAttempted: true,
      extractionSuccess,
      platform,
      country: getCountryFromDomain(url),
      product,
      errors,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    logger.error("extractProductData failed", { url, platform, error: message });
    throw new APIError(502, message);
  }
}
