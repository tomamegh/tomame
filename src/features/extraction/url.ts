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

/**
 * Follow a short link (a.co, ebay.us, bit.ly, …) to its destination.
 * Returns the input unchanged if resolution fails — the caller still gets a
 * usable URL, just possibly one we can't classify.
 */
export async function resolveShortUrl(shortUrl: string): Promise<string> {
  const headers = { "User-Agent": BROWSER_UA };
  try {
    const res = await fetch(shortUrl, {
      method: "HEAD",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.url && res.url !== shortUrl) return res.url;
    const res2 = await fetch(shortUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    return res2.url || shortUrl;
  } catch {
    return shortUrl;
  }
}
