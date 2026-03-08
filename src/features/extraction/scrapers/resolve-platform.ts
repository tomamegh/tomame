import { SupportedPlatform, scraperRegistry } from "./registry";

/** Resolve a URL to its SupportedPlatform by checking scraper domains. */
export function resolvePlatform(url: string): SupportedPlatform | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    for (const [platform, scraper] of Object.entries(scraperRegistry)) {
      for (const domain of scraper.domains) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return platform as SupportedPlatform;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
