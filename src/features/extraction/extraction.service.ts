import type { ServiceResult } from "@/types/domain";
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
  "a.co": "USA", // Amazon short URL defaults to USA
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

export async function extractProductData(
  url: string,
): Promise<ServiceResult<ExtractionResult>> {
  const errors: string[] = [];

  // 1. Resolve platform
  const platform = resolvePlatform(url);
  if (!platform) {
    return {
      success: false,
      error: "Unsupported platform",
      status: 400,
    };
  }

  // 2. Get the platform-specific scraper (includes browserless client)
  const scraper = getScraperByPlatform(platform);

  // 3. Scrape
  try {
    const product = await scraper.scrape(url);

    const extractionSuccess = product.title !== null || product.price !== null;
    if (!extractionSuccess) {
      errors.push("Could not extract product name or price from page");
    }

    return {
      success: true,
      data: {
        extractionAttempted: true,
        extractionSuccess,
        platform,
        country: getCountryFromDomain(url),
        product,
        errors,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    logger.error("extractProductData failed", { url, platform, error: message });

    return {
      success: false,
      error: message,
      status: 502,
    };
  }
}
