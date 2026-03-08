import { SupportedPlatform, getDomainsForPlatform } from "./registry";

/** Resolve a URL to its SupportedPlatform by checking scraper domains. */
export function resolvePlatform(url: string): SupportedPlatform | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    for (const platform of Object.values(SupportedPlatform)) {
      for (const domain of getDomainsForPlatform(platform)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return platform;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
