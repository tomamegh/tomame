import { PlatformScraper } from "./types";
import { AmazonScraper } from "./amazon";
import { EbayScraper } from "./ebay";
import { MicrocenterScraper } from "./microcenter";
import { SheinScraper } from "./shein";
import { browserlessClient, type BrowserlessClient } from "@/lib/browserless/client";

export enum SupportedPlatform {
  AMAZON = "amazon",
  EBAY = "ebay",
  MICROCENTER = "microcenter",
  SHEIN = "shein",
}

/** Platform → scraper class mapping. Add new platforms here. */
const scraperClasses: Record<SupportedPlatform, new (b: BrowserlessClient) => PlatformScraper> = {
  [SupportedPlatform.AMAZON]: AmazonScraper,
  [SupportedPlatform.EBAY]: EbayScraper,
  [SupportedPlatform.MICROCENTER]: MicrocenterScraper,
  [SupportedPlatform.SHEIN]: SheinScraper,
};

/** Instantiated scrapers keyed by platform (lazy singleton per platform). */
const instances = new Map<SupportedPlatform, PlatformScraper>();

export function getScraperByPlatform(platform: SupportedPlatform): PlatformScraper {
  let scraper = instances.get(platform);
  if (!scraper) {
    const Ctor = scraperClasses[platform];
    scraper = new Ctor(browserlessClient);
    instances.set(platform, scraper);
  }
  return scraper;
}

/** Get the domains array for a given platform (used by resolvePlatform). */
export function getDomainsForPlatform(platform: SupportedPlatform): string[] {
  return getScraperByPlatform(platform).domains;
}
