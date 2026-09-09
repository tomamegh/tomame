import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { browserlessClient, isBrowserlessConfigured } from "@/lib/browserless/client";
import type { PlatformScraper } from "../scrapers";
import type { HtmlFetch } from "./types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

/** Plain HTTPS GET. Free, fast, and enough for stores that server-render (eBay, Micro Center often). */
async function directFetch(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      logger.info("html-source: direct fetch non-OK", { url, status: res.status });
      return null;
    }
    const html = await res.text();
    return html && html.length > 500 ? html : null;
  } catch (err) {
    logger.info("html-source: direct fetch failed", { url, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Get a rendered product page, cheapest source first. Each source's output is
 * checked with the platform's `looksLikeProductPage` so a captcha page or an
 * empty SPA shell does not get parsed as "product not found".
 */
export async function fetchProductHtml(
  url: string,
  scraper: PlatformScraper,
  deadline: number,
): Promise<HtmlFetch | null> {
  const remaining = () => deadline - Date.now();

  if (remaining() > 2_000) {
    const html = await directFetch(url, Math.min(EXTRACTION.directFetchTimeoutMs, remaining()));
    if (html && scraper.looksLikeProductPage(html)) return { html, source: "direct" };
  }

  if (!isBrowserlessConfigured()) {
    logger.warn("html-source: browserless not configured, skipping", { url });
    return null;
  }

  if (remaining() > 5_000) {
    const timeout = Math.min(EXTRACTION.browserlessTimeoutMs, remaining() - 2_000);
    const unblock = await browserlessClient.unblockContent(url, timeout);
    if (unblock.success && unblock.html && scraper.looksLikeProductPage(unblock.html)) {
      return { html: unblock.html, source: "browserless" };
    }
    logger.warn("html-source: browserless unblock did not yield a product page", { url, error: unblock.error });
  }

  if (remaining() > 5_000) {
    const timeout = Math.min(EXTRACTION.browserlessTimeoutMs, remaining() - 2_000);
    const content = await browserlessClient.scrapeContent({ url, timeout });
    if (content.success && content.html && scraper.looksLikeProductPage(content.html)) {
      return { html: content.html, source: "browserless" };
    }
    logger.warn("html-source: browserless content did not yield a product page", { url, error: content.error });
  }

  return null;
}
