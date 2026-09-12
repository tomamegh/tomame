import type { CheerioAPI } from "cheerio";
import type { StoreDefinition } from "../stores";
import { normalizeUrl } from "../url";
import { emptyProduct, type PlatformScraper, type ScrapedProduct, type HtmlAttemptName } from "./types";

/**
 * Scraper for stores without a hand-written Cheerio parser. Knows the store's
 * URL shape from the registry and leaves reading the page to the generic
 * JSON-LD/OpenGraph parser and the vendor tiers.
 */
export class GenericScraper implements PlatformScraper {
  public readonly domains: string[];
  public readonly defaultCurrency: string;
  public readonly renderWaitSelector = "h1, [itemprop='name'], script[type='application/ld+json']";
  public readonly htmlAttempts: HtmlAttemptName[] | undefined;
  private readonly productPath: RegExp | undefined;

  constructor(store: StoreDefinition) {
    this.domains = store.domains;
    this.defaultCurrency = store.currency;
    this.htmlAttempts = store.htmlAttempts;
    this.productPath = store.productPath;
  }

  /** Without a known shape, any path with at least one segment is a candidate; the page decides. */
  public isProductUrl(url: string): boolean {
    try {
      const path = new URL(url).pathname;
      if (this.productPath) return this.productPath.test(path + new URL(url).search);
      return path.length > 1 && !/^\/(search|s|cart|checkout|account|login|signin|help)(\/|$)/i.test(path);
    } catch {
      return false;
    }
  }

  public canonicalUrl(raw: string): string {
    return normalizeUrl(raw);
  }

  public looksLikeProductPage(html: string): boolean {
    if (/captcha|access denied|are you a human|checking your browser/i.test(html) && html.length < 20_000) return false;
    return /"@type"\s*:\s*"Product"|og:price:amount|product:price:amount|itemprop=["']price["']/.test(html) || html.length > 30_000;
  }

  /** The generic JSON-LD/OpenGraph resolver owns page parsing; this tier adds nothing. */
  public extract(_$: CheerioAPI): ScrapedProduct {
    return emptyProduct();
  }
}
