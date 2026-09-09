import type { CheerioAPI } from "cheerio";
import type { TomameCategory } from "@/config/categories";

export interface ScrapedProduct {
  /** Product title */
  title: string | null;
  /** Main product image URL */
  image: string | null;
  /** Price as a number, in `currency` */
  price: number | null;
  /** ISO currency code (e.g. "USD", "GBP") */
  currency: string | null;
  /** Product description / about text */
  description: string | null;
  /** Brand name */
  brand: string | null;
  /** Product category (mapped to Tomame category) */
  category: TomameCategory | null;
  /** Selected size (the one shown / default on the page) */
  size: string | null;
  /** Weight as listed on the page (raw string) */
  weight: string | null;
  /** Weight parsed to pounds — the unit the pricing engine uses */
  weight_lbs: number | null;
  /** Product dimensions / measurements */
  dimensions: string | null;
  /** Structured specifications (key-value pairs like material, color, etc.) */
  specifications: Record<string, string>;
  /** Everything else: all images, available sizes, measurements, etc. */
  metadata: Record<string, unknown>;
}

export function emptyProduct(): ScrapedProduct {
  return {
    title: null,
    image: null,
    price: null,
    currency: null,
    description: null,
    brand: null,
    category: null,
    size: null,
    weight: null,
    weight_lbs: null,
    dimensions: null,
    specifications: {},
    metadata: {},
  };
}

/**
 * A platform scraper knows the store's URL shapes and how to read its HTML.
 * It never fetches — fetching is the resolver chain's job — so it is pure and
 * fully testable against fixtures.
 */
export interface PlatformScraper {
  /** Domains this scraper handles (subdomains match). */
  readonly domains: string[];
  /** Currency the store lists in when the page doesn't say. */
  readonly defaultCurrency: string;
  /** Is this a product page URL (vs. search, category, home)? Cheap check, no network. */
  isProductUrl(url: string): boolean;
  /** Canonical product URL — drops tracking, pins locale where it matters. */
  canonicalUrl(url: string): string;
  /** Does this HTML look like a rendered product page (not a captcha / empty shell)? */
  looksLikeProductPage(html: string): boolean;
  /** Extract product data from parsed HTML. */
  extract($: CheerioAPI): ScrapedProduct;
}
