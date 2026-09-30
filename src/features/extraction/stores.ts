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
/**
 * Page sources for every store without its own scraper. ScraperAPI's
 * residential fetch first (2-9 s, 10 credits on the paid plan since
 * 2026-09-29), Zyte's browser second: Zyte flaked on Fashion Nova on hosted
 * dev while its AI reader was already spending most of the 25 s budget.
 */
const PAGE_ATTEMPTS: HtmlAttemptName[] = ["scraperapi-premium", "zyte-browser"];
/**
 * Stores that ban bots (Target, Best Buy, Home Depot, AliExpress, Temu). Zyte
 * was banned or timed out after ~20 s on these (measured 2026-09-30), which
 * spent the whole 25 s budget before anything else ran — and on Target its AI
 * product reader returned $11,534 for a $45 tumbler. So: ScraperAPI's rendered
 * residential fetch FIRST, and the price read from the page's own structured
 * data, never from Zyte's guess.
 */
const BLOCKED_PAGE_ATTEMPTS: HtmlAttemptName[] = ["scraperapi-premium", "scraperapi-render"];
const BLOCKED_PLAN: ProviderPlanEntry[] = ["category-map", "platform-html", "structured-data", "llm"];

/**
 * Popular stores customers paste from that have no scraper of their own. Named
 * so the quote says "Fashion Nova" instead of "Online store", and given the
 * region they ship from so they are priced instead of queued for a human.
 * `beta`: read by the generic plan, not advertised in "stores we read".
 */
const NAMED_STORES: Array<[slug: string, name: string, domains: string[], region: Region, currency: string]> = [
  ["fashionnova", "Fashion Nova", ["fashionnova.com"], "USA", "USD"],
  ["nordstrom", "Nordstrom", ["nordstrom.com", "nordstromrack.com"], "USA", "USD"],
  ["macys", "Macy's", ["macys.com"], "USA", "USD"],
  ["sephora", "Sephora", ["sephora.com"], "USA", "USD"],
  ["ulta", "Ulta Beauty", ["ulta.com"], "USA", "USD"],
  ["gap", "Gap", ["gap.com", "oldnavy.gap.com", "bananarepublic.gap.com"], "USA", "USD"],
  ["oldnavy", "Old Navy", ["oldnavy.com"], "USA", "USD"],
  ["lululemon", "lululemon", ["lululemon.com"], "USA", "USD"],
  ["adidas", "adidas", ["adidas.com"], "USA", "USD"],
  ["footlocker", "Foot Locker", ["footlocker.com", "champssports.com"], "USA", "USD"],
  ["victoriassecret", "Victoria's Secret", ["victoriassecret.com"], "USA", "USD"],
  ["bathandbodyworks", "Bath & Body Works", ["bathandbodyworks.com"], "USA", "USD"],
  ["apple", "Apple", ["apple.com"], "USA", "USD"],
  ["kohls", "Kohl's", ["kohls.com"], "USA", "USD"],
  ["jcpenney", "JCPenney", ["jcpenney.com"], "USA", "USD"],
  ["dicks", "DICK'S Sporting Goods", ["dickssportinggoods.com"], "USA", "USD"],
  ["revolve", "Revolve", ["revolve.com"], "USA", "USD"],
  ["skims", "SKIMS", ["skims.com"], "USA", "USD"],
  ["fentybeauty", "Fenty Beauty", ["fentybeauty.com"], "USA", "USD"],
  ["costco", "Costco", ["costco.com"], "USA", "USD"],
  ["newegg", "Newegg", ["newegg.com"], "USA", "USD"],
  ["bhphoto", "B&H Photo", ["bhphotovideo.com"], "USA", "USD"],
  ["zappos", "Zappos", ["zappos.com"], "USA", "USD"],
  ["urbanoutfitters", "Urban Outfitters", ["urbanoutfitters.com"], "USA", "USD"],
  ["anthropologie", "Anthropologie", ["anthropologie.com"], "USA", "USD"],
  ["abercrombie", "Abercrombie & Fitch", ["abercrombie.com", "hollisterco.com"], "USA", "USD"],
  ["americaneagle", "American Eagle", ["ae.com"], "USA", "USD"],
  ["carters", "Carter's", ["carters.com"], "USA", "USD"],
  ["gamestop", "GameStop", ["gamestop.com"], "USA", "USD"],
  ["wayfair", "Wayfair", ["wayfair.com"], "USA", "USD"],
  ["chewy", "Chewy", ["chewy.com"], "USA", "USD"],
  ["asos", "ASOS", ["asos.com"], "UK", "GBP"],
  ["boohoo", "boohoo", ["boohoo.com"], "UK", "GBP"],
  ["prettylittlething", "PrettyLittleThing", ["prettylittlething.com"], "UK", "GBP"],
  ["next", "Next", ["next.co.uk"], "UK", "GBP"],
  ["currys", "Currys", ["currys.co.uk"], "UK", "GBP"],
  ["johnlewis", "John Lewis", ["johnlewis.com"], "UK", "GBP"],
];

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
    // Target's price lives only in its product API (target-redsky.ts), read by the scraperapi tier.
    providers: ["scraperapi", ...BLOCKED_PLAN], htmlAttempts: BLOCKED_PAGE_ATTEMPTS, status: "live", productPath: /\/p\/.+\/A-\d+/,
  },
  {
    slug: "bestbuy", name: "Best Buy", domains: ["bestbuy.com"], region: "USA", currency: "USD",
    providers: BLOCKED_PLAN, htmlAttempts: BLOCKED_PAGE_ATTEMPTS, status: "blocked", productPath: /\/site\/.+\.p(?:$|\?)|\/site\/\d+\.p/,
  },
  {
    slug: "homedepot", name: "The Home Depot", domains: ["homedepot.com"], region: "USA", currency: "USD",
    providers: BLOCKED_PLAN, htmlAttempts: BLOCKED_PAGE_ATTEMPTS, status: "blocked", productPath: /\/p\/.+\/\d+/,
  },
  {
    slug: "aliexpress", name: "AliExpress", domains: ["aliexpress.com", "aliexpress.us"], region: "CHINA", currency: "USD",
    providers: BLOCKED_PLAN, htmlAttempts: BLOCKED_PAGE_ATTEMPTS, status: "blocked", productPath: /\/item\/\d+\.html/,
  },
  {
    slug: "temu", name: "Temu", domains: ["temu.com"], region: "CHINA", currency: "USD",
    providers: BLOCKED_PLAN, htmlAttempts: BLOCKED_PAGE_ATTEMPTS, status: "blocked", productPath: /-g-\d+\.html|goods\.html/,
  },
  {
    slug: "argos", name: "Argos", domains: ["argos.co.uk"], region: "UK", currency: "GBP",
    providers: GENERIC_PLAN, htmlAttempts: ["direct", "zyte-browser"], status: "beta", productPath: /\/product\/\d+/,
  },
  ...NAMED_STORES.map(([slug, name, domains, region, currency]): StoreDefinition => ({
    slug, name, domains, region, currency, providers: GENERIC_PLAN, htmlAttempts: PAGE_ATTEMPTS, status: "beta",
  })),
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
  htmlAttempts: PAGE_ATTEMPTS,
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
