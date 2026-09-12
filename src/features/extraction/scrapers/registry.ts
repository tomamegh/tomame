import type { PlatformScraper } from "./types";
import { amazonScraper } from "./amazon";
import { ebayScraper } from "./ebay";
import { microcenterScraper } from "./microcenter";
import { sheinScraper } from "./shein";
import { GenericScraper } from "./generic";
import { GENERIC_STORE, STORES, liveStoreNames, storeForUrl, type StoreDefinition } from "../stores";

/** Stores with a hand-written Cheerio parser. Every other store uses GenericScraper. */
export enum SupportedPlatform {
  AMAZON = "amazon",
  EBAY = "ebay",
  MICROCENTER = "microcenter",
  SHEIN = "shein",
}

const platformScrapers: Record<SupportedPlatform, PlatformScraper> = {
  [SupportedPlatform.AMAZON]: amazonScraper,
  [SupportedPlatform.EBAY]: ebayScraper,
  [SupportedPlatform.MICROCENTER]: microcenterScraper,
  [SupportedPlatform.SHEIN]: sheinScraper,
};

const genericScrapers = new Map<StoreDefinition, PlatformScraper>();

function isSupportedPlatform(slug: string): slug is SupportedPlatform {
  return (Object.values(SupportedPlatform) as string[]).includes(slug);
}

/** Scraper for a store: the hand-written one when it exists, else a registry-driven generic. */
export function getScraperForStore(store: StoreDefinition): PlatformScraper {
  if (isSupportedPlatform(store.slug)) return platformScrapers[store.slug];
  let s = genericScrapers.get(store);
  if (!s) {
    s = new GenericScraper(store);
    genericScrapers.set(store, s);
  }
  return s;
}

/** Scraper by slug alone (tests, enrichment). Unknown slugs get the generic store's scraper. */
export function getScraperByPlatform(platform: string): PlatformScraper {
  if (isSupportedPlatform(platform)) return platformScrapers[platform];
  const store = STORES.find((s) => s.slug === platform) ?? GENERIC_STORE;
  return getScraperForStore(store);
}

/** Get the domains array for a given platform (used by resolvePlatform). */
export function getDomainsForPlatform(platform: string): string[] {
  return STORES.filter((s) => s.slug === platform).flatMap((s) => s.domains);
}

/** Store slug for a URL — registered store, or "generic" for any other public host. */
export function resolvePlatform(url: string): string | null {
  return storeForUrl(url)?.slug ?? null;
}

export const SUPPORTED_STORE_NAMES: readonly string[] = liveStoreNames();
