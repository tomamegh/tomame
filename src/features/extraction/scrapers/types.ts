import type { CheerioAPI } from "cheerio";

export interface ScrapedProduct {
  /** Product title */
  title: string | null;
  /** Main product image URL */
  image: string | null;
  /** Price as a number */
  price: number | null;
  /** Currency code (e.g. "USD", "GBP") */
  currency: string | null;
  /** Product description / about text */
  description: string | null;
  /** Brand name */
  brand: string | null;
  /** Selected size (the one shown / default on the page) */
  size: string | null;
  /** Weight as listed on the page */
  weight: string | null;
  /** Product dimensions / measurements */
  dimensions: string | null;
  /** Structured specifications (key-value pairs like material, color, etc.) */
  specifications: Record<string, string>;
  /** Everything else: all images, available sizes, measurements, etc. */
  metadata: Record<string, unknown>;
}

export interface PlatformScraper {
  /** Domains this scraper handles */
  domains: string[];
  /** Extract product data from parsed HTML */
  extract($: CheerioAPI): ScrapedProduct;
}
