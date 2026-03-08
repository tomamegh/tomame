import type { PlatformScraper } from "./types";
import { amazonScraper } from "./amazon";

export enum SupportedPlatform {
  AMAZON = "amazon",
}

/** Platform → scraper mapping. Add new platforms here. */
export const scraperRegistry: Record<SupportedPlatform, PlatformScraper> = {
  [SupportedPlatform.AMAZON]: amazonScraper,
};

export function getScraperByPlatform(platform: SupportedPlatform): PlatformScraper {
  return scraperRegistry[platform];
}
