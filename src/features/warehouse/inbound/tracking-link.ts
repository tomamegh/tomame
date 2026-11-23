/**
 * "Number or link": staff paste whatever the store's shipping email gives them.
 * A carrier tracking link carries the number in its query or path, so the
 * number is pulled out here and then checked by the one validator,
 * `trackingInputProblem` (Fix 12). A tracking page with no number in it (Amazon's
 * Share tracking) is kept as a link (141); anything else is passed through
 * unchanged and that validator names what is wrong with it.
 *
 * Pure: the purchase and tracking sheets use it in the browser.
 */

import { detectCarrier, trackingInputProblem, trackingKey } from "./tracking-number";

/** Query keys carriers and stores put the tracking number under. */
const NUMBER_PARAMS = [
  "tracknum",
  "tracknumbers",
  "trknbr",
  "tlabels",
  "tracking-id",
  "trackingid",
  "trackingnumber",
  "tracking_number",
  "trackingnumbers",
  "inquirynumber1",
  "number",
  "tracking",
  "id",
];

/** The tracking number inside a carrier link, or null when the text is not a link with one. */
export function trackingFromLink(raw: string): string | null {
  const text = raw.trim();
  if (!/^(https?:\/\/|www\.)/i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
  } catch {
    return null;
  }
  // A product page's id is not a parcel: eBay's 12-digit item number reads as FedEx.
  if (PRODUCT_PAGE.test(url.pathname)) return null;
  const params = new Map([...url.searchParams.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  for (const key of NUMBER_PARAMS) {
    const value = params.get(key)?.split(/[,\s]/)[0];
    if (value && trackingInputProblem(value) == null) return value;
  }
  // Path-style links (".../track/1Z999AA10123456784") and the hash Royal Mail uses.
  const tokens = `${url.pathname}/${url.hash}`.split(/[/#?=&]+/).map(trackingKey).filter(Boolean);
  for (const token of tokens.reverse()) {
    if (detectCarrier(token) !== "other" && trackingInputProblem(token) == null) return token;
  }
  return null;
}

// ── Links with no number in them (141) ──────────────────────────────────────

/** A page about a product, not a parcel: Amazon, eBay, Walmart, Shopify, SHEIN. */
const PRODUCT_PAGE = /\/(dp|gp\/product|gp\/aw\/d|itm|ip|products?)\/|-p-\d+\.html/i;
/** Pages only Tomame's store account can open; a customer or another staff member gets a sign-in page. */
const PRIVATE_PAGE = /\/(gp\/your-account|your-account|gp\/css|your-orders|ap\/signin)\b|\/progress-tracker\/package(?!\/share)/i;
/** Store short links whose target is only known by following them (the server does, on save). */
export const SHORT_LINK_HOSTS = ["a.co", "amzn.to", "amzn.eu"] as const;

export const LINK_MAX = 500;

const LINK_TOKEN = /^(https?:\/\/|www\.)\S+$/i;

function asHttps(token: string): string {
  if (/^www\./i.test(token)) return `https://${token}`;
  return token.replace(/^http:\/\//i, "https://");
}

/** Why a store link cannot be kept as tracking, or null when it can. Shared by the browser and the server. */
export function storeLinkProblem(url: string, opts: { length?: boolean } = {}): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That link is not complete. Copy it again from the store.";
  }
  const path = `${parsed.pathname}${parsed.search}`;
  if (PRODUCT_PAGE.test(path)) {
    return "That link opens the product page, not tracking. Use the store's Track package or Share tracking link, or the carrier's number.";
  }
  if (PRIVATE_PAGE.test(path)) {
    return "Only our store account can open that link. On Amazon use Track package, then Share tracking, or copy the carrier's number.";
  }
  if (opts.length !== false && url.length > LINK_MAX) return "That link is too long to keep. Copy the carrier's number instead.";
  return null;
}

/**
 * A store tracking link with no number in it (Amazon's Share tracking, a.co/d/…),
 * kept as a link instead of being refused. Null when the text is not only
 * link(s). The same link pasted twice is one link; two different links in one
 * entry are named.
 */
export function readStoreLink(raw: string): { url: string; problem: string | null } | null {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || !tokens.every((t) => LINK_TOKEN.test(t))) return null;
  const links = [...new Set(tokens.map(asHttps))];
  const url = links[0]!;
  if (links.length > 1) return { url, problem: "Two different links in one box. Put a comma between them." };
  return { url, problem: storeLinkProblem(url) };
}

/** True when the link's host is a store short link that the server follows before keeping it. */
export function isShortLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return (SHORT_LINK_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
}

export interface TrackingEntry {
  input: string;
  /** The tracking number, or "" when the entry is a link kept as it is. */
  number: string;
  /** A tracking page with no number in it (141). */
  link: string | null;
  problem: string | null;
}

/** One typed entry: a number, a carrier link turned into its number, or a store tracking link kept whole. */
export function readTrackingEntry(input: string): TrackingEntry {
  const fromLink = trackingFromLink(input);
  if (fromLink) return { input, number: fromLink, link: null, problem: trackingInputProblem(fromLink) };
  const link = readStoreLink(input);
  if (link) return { input, number: "", link: link.url, problem: link.problem };
  return { input, number: input, link: null, problem: trackingInputProblem(input) };
}

/** What staff typed, split on commas and new lines, each link turned into its number or kept as a link. */
export function readTrackingEntries(raw: string): TrackingEntry[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(readTrackingEntry);
}
