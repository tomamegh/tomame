import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { browserlessClient, isBrowserlessConfigured } from "@/lib/browserless/client";
import type { PlatformScraper } from "../scrapers";
import type { HtmlAttemptName } from "../scrapers/types";
import type { HtmlFetch } from "./types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

/** Plain HTTPS GET. Free, fast, and enough for stores that server-render. */
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

type Attempt = {
  name: HtmlAttemptName;
  /** Minimum time that must remain in the budget for this attempt to start. */
  minRemainingMs: number;
  /** Extra runs when the first returns a blocked/shell page. */
  retries: number;
  run: (timeoutMs: number) => Promise<{ success: boolean; html: string | null; error: string | null }>;
};

/**
 * Get a rendered product page, cheapest source first. Every source's output is
 * checked with the platform's `looksLikeProductPage` so a captcha page or an
 * empty SPA shell does not get parsed as "product not found".
 *
 * Observed live (2026-09-09): Amazon answers the datacenter unblock; eBay and
 * SHEIN return error/shell pages from any datacenter IP and need the
 * residential proxy (eBay via unblock, SHEIN via rendered content with a wait
 * selector); Micro Center's Cloudflare challenge did not clear within budget.
 */
export interface FetchHtmlOptions {
  /** Skip the plain GET — used when a direct page passed the shape check but parsed to nothing. */
  skipDirect?: boolean;
}

export async function fetchProductHtml(
  url: string,
  scraper: PlatformScraper,
  deadline: number,
  opts: FetchHtmlOptions = {},
): Promise<HtmlFetch | null> {
  const remaining = () => deadline - Date.now();

  const order: HtmlAttemptName[] = scraper.htmlAttempts ?? ["direct", "unblock", "unblock+residential", "content+residential"];

  if (order.includes("direct") && !opts.skipDirect && remaining() > 2_000) {
    const html = await directFetch(url, Math.min(EXTRACTION.directFetchTimeoutMs, remaining()));
    if (html && scraper.looksLikeProductPage(html)) return { html, source: "direct" };
  }

  if (!isBrowserlessConfigured()) {
    logger.warn("html-source: browserless not configured, skipping", { url });
    return null;
  }

  const catalogue: Record<Exclude<HtmlAttemptName, "direct">, Attempt> = {
    unblock: {
      name: "unblock",
      minRemainingMs: 8_000,
      retries: 0,
      run: (t) => browserlessClient.unblockContent(url, t),
    },
    "unblock+residential": {
      name: "unblock+residential",
      minRemainingMs: 15_000,
      // Residential exits are per-request; eBay blocks roughly one in three.
      retries: 1,
      run: (t) => browserlessClient.unblockContent(url, t, { proxy: "residential", waitForTimeout: 3_000 }),
    },
    "content+residential": {
      name: "content+residential",
      minRemainingMs: 15_000,
      retries: 0,
      run: (t) => browserlessClient.scrapeContent({ url, timeout: t, waitForSelector: scraper.renderWaitSelector, proxy: "residential" }),
    },
    content: {
      name: "content",
      minRemainingMs: 15_000,
      retries: 0,
      run: (t) => browserlessClient.scrapeContent({ url, timeout: t, waitForSelector: scraper.renderWaitSelector }),
    },
  };
  const attempts = order.filter((n): n is Exclude<HtmlAttemptName, "direct"> => n !== "direct").map((n) => catalogue[n]);

  for (const attempt of attempts) {
    for (let run = 0; run <= attempt.retries; run++) {
      if (remaining() < attempt.minRemainingMs) {
        logger.info("html-source: out of budget", { url, skipped: attempt.name, remainingMs: remaining() });
        return null;
      }
      const timeout = Math.min(EXTRACTION.browserlessTimeoutMs, remaining() - 3_000);
      const t0 = Date.now();
      const result = await attempt.run(timeout);
      if (result.success && result.html && scraper.looksLikeProductPage(result.html)) {
        logger.info("html-source: page obtained", { url, via: attempt.name, run, ms: Date.now() - t0, bytes: result.html.length });
        return { html: result.html, source: "browserless" };
      }
      logger.warn("html-source: attempt did not yield a product page", {
        url,
        via: attempt.name,
        run,
        ms: Date.now() - t0,
        error: result.error,
        bytes: result.html?.length ?? 0,
      });
    }
  }

  return null;
}
