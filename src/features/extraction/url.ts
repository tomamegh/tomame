import { createHash } from "crypto";

export type Region = "USA" | "UK" | "CHINA";

/** Region as the pricing calculator spells it. */
export const REGION_TO_PRICING = { USA: "usa", UK: "uk", CHINA: "china" } as const;
export const PRICING_TO_REGION = { usa: "USA", uk: "UK", china: "CHINA" } as const;

/** Store hostname → region the item ships from. Subdomains match too. */
const DOMAIN_REGION: Record<string, Region> = {
  "amazon.com": "USA",
  "a.co": "USA",
  "amazon.co.uk": "UK",
  "ebay.com": "USA",
  "ebay.us": "USA",
  "ebay.to": "USA",
  "ebay.co.uk": "UK",
  "microcenter.com": "USA",
  "walmart.com": "USA",
  "target.com": "USA",
  "bestbuy.com": "USA",
  "argos.co.uk": "UK",
  "aliexpress.com": "CHINA",
  "alibaba.com": "CHINA",
  "temu.com": "CHINA",
  "shein.com": "CHINA",
};

/** Currency a store lists prices in when the page doesn't say. */
const DOMAIN_CURRENCY: Record<string, string> = {
  "amazon.co.uk": "GBP",
  "ebay.co.uk": "GBP",
  "argos.co.uk": "GBP",
};

const SHORT_URL_HOSTS = new Set(["a.co", "amzn.to", "amzn.eu", "ebay.us", "ebay.to", "bit.ly", "ow.ly", "buff.ly"]);

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "ref", "ref_", "tag", "linkCode", "psc", "th", "pd_rd_i", "pd_rd_r", "pd_rd_w", "pd_rd_wg",
  "pf_rd_p", "pf_rd_r", "content-id", "sr", "keywords", "qid", "spm", "aff_id", "mkcid", "mkrid",
  "campid", "toolid", "customid", "hash", "epid", "_trkparms", "_trksid", "var", "fbclid", "gclid",
];

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

export function isShortUrl(url: string): boolean {
  const u = parseUrl(url);
  return !!u && SHORT_URL_HOSTS.has(u.hostname.toLowerCase());
}

export function regionForUrl(url: string): Region | null {
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  for (const [domain, region] of Object.entries(DOMAIN_REGION)) {
    if (hostMatches(host, domain)) return region;
  }
  return null;
}

export function defaultCurrencyForUrl(url: string): string {
  const u = parseUrl(url);
  if (!u) return "USD";
  const host = u.hostname.toLowerCase();
  for (const [domain, currency] of Object.entries(DOMAIN_CURRENCY)) {
    if (hostMatches(host, domain)) return currency;
  }
  return "USD";
}

/** Strip fragments and tracking params; sort the rest. Used for cache keys. */
export function normalizeUrl(raw: string): string {
  const u = parseUrl(raw);
  if (!u) return raw.trim().toLowerCase();
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
  u.searchParams.sort();
  return u.toString().replace(/\/+$/, "");
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

/** Hosts a short link may land on: the stores we support, or another shortener. */
function isAllowedRedirectHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (SHORT_URL_HOSTS.has(host)) return true;
  return Object.keys(DOMAIN_REGION).some((domain) => hostMatches(host, domain));
}

/**
 * Follow a short link (a.co, ebay.us, bit.ly, …) to its destination, one hop at
 * a time, and only onto hosts we would scrape anyway. This endpoint is public,
 * so a shortener must not be able to make the server request arbitrary URLs.
 * Returns the input unchanged if resolution fails.
 */
export async function resolveShortUrl(shortUrl: string, maxHops = 5): Promise<string> {
  let current = shortUrl;
  for (let hop = 0; hop < maxHops; hop++) {
    const u = parseUrl(current);
    if (!u || !isAllowedRedirectHost(u.hostname)) return shortUrl;
    if (!SHORT_URL_HOSTS.has(u.hostname.toLowerCase())) return current; // landed on a store
    try {
      const res = await fetch(current, {
        method: "HEAD",
        headers: { "User-Agent": BROWSER_UA },
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      const location = res.headers.get("location");
      if (!location) return current;
      current = new URL(location, current).toString();
    } catch {
      return shortUrl;
    }
  }
  return current;
}

/** ASIN from any Amazon product URL shape (/dp/, /gp/product/, /gp/aw/d/, /product/). */
export function amazonAsinOf(url: string): string | null {
  const u = parseUrl(url);
  if (!u) return null;
  const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m?.[1]?.toUpperCase() ?? null;
}

/** "amazon.com", "amazon.co.uk", … — the marketplace the URL points at. */
export function amazonDomainOf(url: string): string {
  const host = parseUrl(url)?.hostname.toLowerCase() ?? "";
  return host.match(/amazon\.[a-z.]+$/)?.[0] ?? "amazon.com";
}

/** Numeric item id from any eBay listing URL shape (/itm/<id>, /itm/<slug>/<id>). */
export function ebayItemIdOf(url: string): string | null {
  const u = parseUrl(url);
  if (!u) return null;
  return u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/)?.[1] ?? null;
}
