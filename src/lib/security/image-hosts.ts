/**
 * The hosts `/_next/image` is allowed to fetch on our server's dime.
 *
 * `next.config.ts` used to ship `remotePatterns: [{ protocol: "https", hostname: "**" }]`,
 * which made the optimizer an open proxy: anyone could make the deployment
 * fetch and resize an arbitrary internet image
 * (`GET /_next/image?url=https://<anything>&w=64` returned 200 locally).
 *
 * Narrowing it naively breaks real product photos, because the catalogue
 * scrapes many stores and today's list of stores is not tomorrow's. So this
 * file is a measured allowlist, not a guess:
 *
 * - `OBSERVED_IMAGE_HOSTS` is every distinct image host actually seen in
 *   `catalog_products.image_url`, `extraction_cache.result.product.image` and
 *   `orders.product_image_url`, on both the local stack and hosted dev
 *   (queried 2026-09-14). Note these are almost all CDN hosts on a different
 *   apex than the store's own domain (Amazon photos come from
 *   `m.media-amazon.com`, not `amazon.com`; eBay from `i.ebayimg.com`; Walmart
 *   from `walmartimages.com`; Etsy from `etsystatic.com`), which is exactly
 *   why a naive "allow the registered store's domain" rule would have missed
 *   all of them.
 * - `REGISTERED_STORE_HOSTS` mirrors the domains in
 *   `src/features/extraction/resolvers/stores.ts` (kept as a literal copy,
 *   not an import — this file has to stay import-free of the extraction
 *   feature so it can be reasoned about and tested in isolation), for stores
 *   whose photos happen to be served from their own domain (Nike's
 *   `static.nike.com`, Micro Center's `productimages.microcenter.com` — both
 *   already observed — plus the stores not yet seen in the sample).
 *
 * The measurement also turned up `www.cmcpro.com` in hosted-dev
 * `extraction_cache` — a real "generic" store nobody registered — which is
 * the proof this allowlist cannot be exhaustive. `isAllowedImageHost` is
 * therefore not the only thing standing between a photo and the customer:
 * `imageOptimizerDecision` (below) is what `src/lib/supabase/proxy.ts` calls
 * on every `/_next/image?url=...` request. Anything that fails this check is
 * rewritten to `/api/image-passthrough`, which streams it from our own origin
 * instead of letting Next's optimizer 400 it.
 */

export interface ImageHostEntry {
  /** Apex (or exact) hostname, lowercase, no protocol, no trailing dot. */
  hostname: string;
  /** True if any subdomain of `hostname` should also match (not just the exact host). */
  matchSubdomains: boolean;
  /** Where this entry came from, for anyone re-running the measurement later. */
  reason: string;
}

const OBSERVED_IMAGE_HOSTS: ImageHostEntry[] = [
  { hostname: "m.media-amazon.com", matchSubdomains: false, reason: "Amazon product images" },
  { hostname: "i.ebayimg.com", matchSubdomains: false, reason: "eBay product images" },
  { hostname: "i5.walmartimages.com", matchSubdomains: false, reason: "Walmart product images" },
  { hostname: "i.etsystatic.com", matchSubdomains: false, reason: "Etsy product images" },
  { hostname: "img.ltwebstatic.com", matchSubdomains: false, reason: "SHEIN CDN (some pages serve http, see next.config.ts)" },
  { hostname: "img.shein.com", matchSubdomains: false, reason: "SHEIN CDN (some pages serve http, see next.config.ts)" },
  {
    hostname: "cdn.shopify.com",
    matchSubdomains: false,
    reason: "Many of the 'generic' (unregistered) stores the catalogue scrapes are Shopify storefronts",
  },
];

/** Copied from `src/features/extraction/resolvers/stores.ts` `domains` — see file comment for why this isn't an import. */
const REGISTERED_STORE_HOSTS: ImageHostEntry[] = [
  { hostname: "amazon.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "amazon.co.uk", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "ebay.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "ebay.us", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "ebay.to", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "ebay.co.uk", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "walmart.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "etsy.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "nike.com", matchSubdomains: true, reason: "registered store domain (observed: static.nike.com)" },
  { hostname: "shein.com", matchSubdomains: true, reason: "registered store domain" },
  {
    hostname: "microcenter.com",
    matchSubdomains: true,
    reason: "registered store domain (observed: productimages.microcenter.com, also allowlisted in /api/img-proxy)",
  },
  { hostname: "target.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "bestbuy.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "homedepot.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "aliexpress.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "aliexpress.us", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "temu.com", matchSubdomains: true, reason: "registered store domain" },
  { hostname: "argos.co.uk", matchSubdomains: true, reason: "registered store domain" },
];

export const IMAGE_HOST_ALLOWLIST: ImageHostEntry[] = [...OBSERVED_IMAGE_HOSTS, ...REGISTERED_STORE_HOSTS];

function hostMatches(hostname: string, entry: ImageHostEntry): boolean {
  if (hostname === entry.hostname) return true;
  return entry.matchSubdomains && hostname.endsWith(`.${entry.hostname}`);
}

/** Is this hostname one `/_next/image` may fetch and resize? Case-insensitive. */
export function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return IMAGE_HOST_ALLOWLIST.some((entry) => hostMatches(host, entry));
}

export type ImageOptimizerDecision =
  | { action: "allow" }
  | { action: "passthrough"; to: string };

/**
 * What the proxy should do with a `/_next/image?url=<value>` request, given
 * the raw (already URL-decoded, e.g. via `URLSearchParams.get`) `url` param.
 *
 * - Missing, a same-origin path (`/...`), or unparseable: `"allow"` — let
 *   Next's own handler run and produce its normal behaviour (there is no
 *   external host to check, or the request is malformed in a way Next itself
 *   is better placed to reject).
 * - An allowlisted external host: `"allow"` — Next's optimizer fetches,
 *   resizes and caches it as usual.
 * - Anything else: `"passthrough"`, which the proxy REWRITES to
 *   `/api/image-passthrough` so the photo is streamed from our own origin
 *   under that route's guards. Unresized, but it loads, which is the point:
 *   an unlisted store (proven to happen — see the file comment) must degrade
 *   gracefully, never break the page.
 *
 *   It is deliberately NOT a redirect to the original URL. That would make
 *   this domain an open redirect — `tomame.ca/_next/image?url=https://phishing`
 *   would send a visitor anywhere with our name on the link — which trades a
 *   bandwidth problem for a phishing one.
 */
export function imageOptimizerDecision(urlParam: string | null): ImageOptimizerDecision {
  if (!urlParam || urlParam.startsWith("/")) return { action: "allow" };

  let hostname: string;
  try {
    hostname = new URL(urlParam).hostname;
  } catch {
    return { action: "allow" };
  }

  return isAllowedImageHost(hostname) ? { action: "allow" } : { action: "passthrough", to: urlParam };
}
