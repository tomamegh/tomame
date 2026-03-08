import type { CheerioAPI } from "cheerio";
import type { BrowserlessClient } from "@/lib/browserless/client";

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

export abstract class PlatformScraper {
  protected browserless: BrowserlessClient;

  /** Domains this scraper handles */
  public abstract readonly domains: string[];

  constructor(browserless: BrowserlessClient) {
    this.browserless = browserless;
  }

  /** Fetch the page via browserless and extract product data */
  public abstract scrape(url: string): Promise<ScrapedProduct>;

  /** Extract product data from already-parsed HTML (useful for tests) */
  public abstract extract($: CheerioAPI): ScrapedProduct;
}
