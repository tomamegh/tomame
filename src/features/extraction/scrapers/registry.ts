import type { PlatformScraper } from "./types";
import { amazonScraper } from "./amazon";
import { ebayScraper } from "./ebay";
import { microcenterScraper } from "./microcenter";
import { sheinScraper } from "./shein";

export enum SupportedPlatform {
  AMAZON = "amazon",
  EBAY = "ebay",
  MICROCENTER = "microcenter",
  SHEIN = "shein",
}

/** Platform → scraper. Add new platforms here. */
const scrapers: Record<SupportedPlatform, PlatformScraper> = {
  [SupportedPlatform.AMAZON]: amazonScraper,
  [SupportedPlatform.EBAY]: ebayScraper,
  [SupportedPlatform.MICROCENTER]: microcenterScraper,
  [SupportedPlatform.SHEIN]: sheinScraper,
};

export function getScraperByPlatform(platform: SupportedPlatform): PlatformScraper {
  return scrapers[platform];
}

/** Get the domains array for a given platform (used by resolvePlatform). */
export function getDomainsForPlatform(platform: SupportedPlatform): string[] {
  return scrapers[platform].domains;
}

export const SUPPORTED_STORE_NAMES = ["Amazon", "eBay", "SHEIN", "Micro Center"] as const;
