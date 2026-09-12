import type { ExtractionSource } from "@/config/extraction";
import type { Region } from "./url";
import type { HtmlAttemptName } from "./scrapers/types";

/**
 * The store registry — the single place a store exists.
 *
 * Extraction reads `domains` / `providers`, pricing reads `region`, the UI
 * reads `name` / `status`. Adding a store is one entry here: the Zyte generic
 * tier reads any store that renders a product page, so most stores need no
 * scraper at all. A store gets a dedicated Cheerio parser (`scrapers/`) or a
 * vendor mapping (`resolvers/`) only when the generic path is too slow or
 * blocked for it.
 */
export type StoreStatus = "live" | "beta" | "blocked";

/** A plan entry: a resolver name, or a name with a per-store start policy override. */
export type ProviderPlanEntry = ExtractionSource | { name: ExtractionSource; startAfterMs?: number };

export interface StoreDefinition {
  /** Stable id; also `ExtractionResult.platform`. */
  slug: string;
  name: string;
  /** Hostnames this store answers on. Subdomains match. */
  domains: string[];
  /** Region the item ships from → pricing region. `null` = customer confirms. */
  region: Region | null;
  currency: string;
  /** Resolvers to run, in cheapest→costliest order. Filtered by key availability at runtime. */
  providers: ProviderPlanEntry[];
  /** HTML sources for the page parsers, in order. Omit for the default. */
  htmlAttempts?: HtmlAttemptName[];
  /**
   * live    — reads reliably, shown in "stores we read"
   * beta    — reads sometimes / slowly; not advertised
   * blocked — every path fails today; quote falls straight to manual entry
   */
  status: StoreStatus;
  /** Pathname test for "this is a product page" when no scraper owns the store. */
  productPath?: RegExp;
}

export const GENERIC_STORE_SLUG = "generic";

/** Plans shared by several stores. */
const AMAZON_PLAN: ProviderPlanEntry[] = ["scraperapi", "oxylabs", "zyte", "rainforest", "category-map", "platform-html", "structured-data", "llm"];
const GENERIC_PLAN: ProviderPlanEntry[] = ["zyte", "category-map", "structured-data", "llm"];

export const STORES: StoreDefinition[] = [
  { slug: "amazon", name: "Amazon", domains: ["amazon.com", "a.co", "amzn.to"], region: "USA", currency: "USD", providers: AMAZON_PLAN, status: "live" },
  { slug: "amazon", name: "Amazon UK", domains: ["amazon.co.uk", "amzn.eu"], region: "UK", currency: "GBP", providers: AMAZON_PLAN, status: "live" },
  {
    slug: "ebay", name: "eBay", domains: ["ebay.com", "ebay.us", "ebay.to"], region: "USA", currency: "USD",
    providers: ["scraperapi", "category-map", "platform-html", "structured-data", "llm"], status: "live",
  },
  {
    slug: "ebay", name: "eBay UK", domains: ["ebay.co.uk"], region: "UK", currency: "GBP",
    providers: ["scraperapi", "category-map", "platform-html", "structured-data", "llm"], status: "live",
  },
  {
    slug: "walmart", name: "Walmart", domains: ["walmart.com"], region: "USA", currency: "USD",
    providers: ["oxylabs", "zyte", "category-map", "structured-data", "llm"], htmlAttempts: ["zyte-browser", "oxylabs-render"],
    status: "live", productPath: /\/ip\/(?:[^/]+\/)?\d{6,}/,
  },
  {
    slug: "etsy", name: "Etsy", domains: ["etsy.com"], region: "USA", currency: "USD",
    providers: GENERIC_PLAN, htmlAttempts: ["zyte-browser"], status: "live", productPath: /\/listing\/\d+/,
  },
  {
    slug: "nike", name: "Nike", domains: ["nike.com"], region: "USA", currency: "USD",
    providers: GENERIC_PLAN, htmlAttempts: ["zyte-browser"], status: "live", productPath: /\/t\/[^/]+\/[A-Z0-9-]+/i,
  },
  {
    slug: "shein", name: "SHEIN", domains: ["shein.com"], region: "CHINA", currency: "USD",
    providers: ["zyte", { name: "platform-html", startAfterMs: 0 }, { name: "structured-data", startAfterMs: 0 }, "category-map", "llm"], status: "beta",
  },
  {
    slug: "microcenter", name: "Micro Center", domains: ["microcenter.com"], region: "USA", currency: "USD",
    providers: ["category-map", "platform-html", "structured-data", "llm"], status: "beta",
  },
  {
    slug: "target", name: "Target", domains: ["target.com"], region: "USA", currency: "USD",
    providers: GENERIC_PLAN, htmlAttempts: ["zyte-browser"], status: "blocked", productPath: /\/p\/.+\/A-\d+/,
  },
  {
    slug: "bestbuy", name: "Best Buy", domains: ["bestbuy.com"], region: "USA", currency: "USD",
    providers: GENERIC_PLAN, htmlAttempts: ["zyte-browser"], status: "blocked", productPath: /\/site\/.+\.p(?:$|\?)|\/site\/\d+\.p/,
  },
  {
    slug: "homedepot", name: "The Home Depot", domains: ["homedepot.com"], region: "USA", currency: "USD",
    providers: GENERIC_PLAN, htmlAttempts: ["zyte-browser"], status: "blocked", productPath: /\/p\/.+\/\d+/,
  },
  {
    slug: "aliexpress", name: "AliExpress", domains: ["aliexpress.com", "aliexpress.us"], region: "CHINA", currency: "USD",
    providers: GENERIC_PLAN, htmlAttempts: ["zyte-browser"], status: "blocked", productPath: /\/item\/\d+\.html/,
  },
  {
    slug: "temu", name: "Temu", domains: ["temu.com"], region: "CHINA", currency: "USD",
    providers: GENERIC_PLAN, htmlAttempts: ["zyte-browser"], status: "blocked", productPath: /-g-\d+\.html|goods\.html/,
  },
  {
    slug: "argos", name: "Argos", domains: ["argos.co.uk"], region: "UK", currency: "GBP",
    providers: GENERIC_PLAN, htmlAttempts: ["direct", "zyte-browser"], status: "beta", productPath: /\/product\/\d+/,
  },
];

/**
 * Any other https host. Region unknown (the customer confirms), Zyte reads the
 * page. No direct fetch from our own servers: the quote endpoint is public and
 * must not be turned into a proxy for arbitrary URLs.
 */
export const GENERIC_STORE: StoreDefinition = {
  slug: GENERIC_STORE_SLUG,
  name: "Online store",
  domains: [],
  region: null,
  currency: "USD",
  providers: GENERIC_PLAN,
  htmlAttempts: ["zyte-browser"],
  status: "beta",
};

function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** A hostname we are willing to send to a vendor: a public DNS name, not an IP or internal host. */
export function isPublicHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h.includes(".")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false; // IPv4 / IPv6 literal
  if (/\.(local|localhost|internal|lan|home|arpa)$/.test(h)) return false;
  return /^[a-z0-9.-]+$/.test(h);
}

/** The registered store for a URL, or `null` when the host is not one we know. */
export function findStore(url: string): StoreDefinition | null {
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  for (const store of STORES) {
    if (store.domains.some((d) => hostMatches(host, d))) return store;
  }
  return null;
}

/** The store for a URL, falling back to the generic store for any public host. `null` only for unusable URLs. */
export function storeForUrl(url: string): StoreDefinition | null {
  const known = findStore(url);
  if (known) return known;
  const u = parseUrl(url);
  if (!u || !isPublicHostname(u.hostname)) return null;
  return GENERIC_STORE;
}

/** Display names of the stores we advertise, de-duplicated by slug (Amazon + Amazon UK → "Amazon"). */
export function liveStoreNames(): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const s of STORES) {
    if (s.status !== "live" || seen.has(s.slug)) continue;
    seen.add(s.slug);
    names.push(s.name);
  }
  return names;
}

/** Every registered hostname — used to fence short-link redirects. */
export function registeredDomains(): string[] {
  return STORES.flatMap((s) => s.domains);
}
