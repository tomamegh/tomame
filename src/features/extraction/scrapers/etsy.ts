import type { CheerioAPI } from "cheerio";
import type { HtmlAttemptName, PlatformScraper, ScrapedProduct } from "./types";
import { emptyProduct } from "./types";
import { cleanString } from "./parse";

/**
 * Etsy listing pages. Price, title and images come from the page's JSON-LD
 * (structured-data tier) and Zyte's product read; this parser exists for what
 * neither carries: the seller's shipping to the viewer's country, printed in
 * the "Shipping and return policies" section as "Cost to ship: $5.99" or
 * "Free shipping". Etsy sellers set shipping per destination country, and
 * Zyte reads the page from the US, so the figure is the hub's.
 */
const LISTING_ID = /\/listing\/(\d{6,})/;

/** "$5.99" → 5.99, "€ 27,68" → 27.68, "Free shipping" → 0, anything else → null. */
export function parseEtsyShippingText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  if (/\bfree (shipping|delivery)\b/i.test(t)) return 0;
  const m = t.match(/cost to ship:?\s*(?:[A-Z]{3}\s*)?[$£€]?\s*([\d.,]+)/i) ?? t.match(/^[$£€]\s*([\d.,]+)$/);
  if (!m?.[1]) return null;
  let n = m[1];
  // "27,68" is a decimal comma; "1,299.00" / "1,299" a thousands separator.
  n = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(n) ? n.replace(/,/g, "") : /^\d+,\d{1,2}$/.test(n) ? n.replace(",", ".") : n.replace(/,/g, "");
  const v = parseFloat(n);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
}

/**
 * The buy box's shipping line: a list item reading "Free shipping" or
 * "Cost to ship:" with the amount in a child element (2026-10-14 markup:
 * `ul.wt-block-grid-xs-1 > li.wt-block-grid__item`). Read page-wide, shortest
 * match first, so a theme change moves it without losing it.
 */
export function etsyShippingText($: CheerioAPI): string | null {
  const lines = $("li, p")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((t) => t.length <= 80 && /^(cost to ship|free shipping|free delivery)\b/i.test(t))
    .sort((a, b) => a.length - b.length);
  return lines[0] ?? null;
}

export class EtsyScraper implements PlatformScraper {
  public readonly domains = ["etsy.com"];
  public readonly defaultCurrency = "USD";
  public readonly renderWaitSelector = "#shipping-and-returns-div, h1, script[type='application/ld+json']";
  /** Only Zyte's US browser renders the page with US prices and US shipping; datacenter proxies land on Etsy.de. */
  public readonly htmlAttempts: HtmlAttemptName[] = ["zyte-browser"];

  public isProductUrl(url: string): boolean {
    try {
      return LISTING_ID.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }

  public canonicalUrl(raw: string): string {
    try {
      const u = new URL(raw);
      const id = u.pathname.match(LISTING_ID)?.[1];
      return id ? `${u.origin}/listing/${id}` : `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  public looksLikeProductPage(html: string): boolean {
    if (/captcha|access denied|are you a human|checking your browser/i.test(html) && html.length < 20_000) return false;
    return /"@type"\s*:\s*"Product"|shipping-and-returns-div|data-buy-box-region/.test(html);
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const shippingText = etsyShippingText($);
    const shop = cleanString($("[data-shop-name], a[href*='/shop/'] p, a[href*='/shop/']").first().text());
    return {
      ...emptyProduct(),
      title: cleanString($("h1").first().text()),
      seller: shop && shop.length < 80 ? shop : null,
      store_shipping: parseEtsyShippingText(shippingText),
      metadata: { storeShippingText: shippingText, images: [] },
    };
  }
}

export const etsyScraper = new EtsyScraper();
