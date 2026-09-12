export { SupportedPlatform, getScraperByPlatform, getScraperForStore, getDomainsForPlatform, resolvePlatform, SUPPORTED_STORE_NAMES } from "./registry";
export type { PlatformScraper, ScrapedProduct } from "./types";
export { emptyProduct, withProductDefaults } from "./types";
export { parseRating, parseReviewCount } from "./parse";
