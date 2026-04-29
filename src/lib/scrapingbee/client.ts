import { logger } from "@/lib/logger";

const SCRAPINGBEE_API_URL = "https://app.scrapingbee.com/api/v1/";

function getApiKey(): string | null {
  return process.env.SCRAPINGBEE_API_KEY ?? null;
}

interface ScrapeContentOptions {
  /** Absolute URL to scrape */
  url: string;
  /** Residential proxies. Use for SHEIN/etc. (5 credits per request). */
  premiumProxy?: boolean;
  /** Stealth mode: residential proxies + JS render + headless-fingerprint
   *  bypass. Required by SHEIN. Costs 75 credits/request. */
  stealthProxy?: boolean;
  /** Render with headless Chrome before returning HTML. Implied by stealthProxy. */
  renderJs?: boolean;
  /** ISO country code for the proxy exit (default: us). */
  countryCode?: string;
  /** Total request timeout (ms). Default 30s. */
  timeout?: number;
  /** Wait for a CSS selector before returning (only relevant with renderJs). */
  waitForSelector?: string;
  /** Block images/CSS/fonts to speed up rendering. Default true at ScrapingBee. */
  blockResources?: boolean;
}

interface ScrapeContentResult {
  success: boolean;
  html: string | null;
  error: string | null;
}

/**
 * ScrapingBee REST API wrapper. Used as a tier between Browserless and
 * Apify for sites with aggressive anti-bot protection (SHEIN, etc.).
 *
 * Pricing is per request, not per result — check usage at scrapingbee.com.
 */
export class ScrapingBeeClient {
  /**
   * Returns null when the SCRAPINGBEE_API_KEY env var is not set, so callers
   * can treat ScrapingBee as an optional tier that's silently skipped if
   * unconfigured.
   */
  public async scrapeContent(options: ScrapeContentOptions): Promise<ScrapeContentResult | null> {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const {
      url,
      premiumProxy = false,
      stealthProxy = false,
      renderJs = false,
      countryCode = "us",
      timeout = 30000,
      waitForSelector,
      blockResources,
    } = options;

    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      country_code: countryCode,
    });
    if (stealthProxy) {
      // Stealth implies its own proxy + JS render. Don't set premium_proxy/render_js
      // alongside it — ScrapingBee rejects the combination.
      params.set("stealth_proxy", "true");
    } else {
      params.set("premium_proxy", String(premiumProxy));
      params.set("render_js", String(renderJs));
    }
    if (waitForSelector) params.set("wait_for", waitForSelector);
    if (blockResources != null) params.set("block_resources", String(blockResources));

    try {
      const response = await fetch(`${SCRAPINGBEE_API_URL}?${params.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(timeout + 5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.warn("scrapingbee scrapeContent failed", {
          url,
          status: response.status,
          error: errorText.slice(0, 200),
        });
        return {
          success: false,
          html: null,
          error: `ScrapingBee ${response.status}: ${errorText.slice(0, 200)}`,
        };
      }

      const html = await response.text();
      return { success: true, html, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("scrapingbee scrapeContent exception", { url, error: message });
      return { success: false, html: null, error: message };
    }
  }
}

export const scrapingbeeClient = new ScrapingBeeClient();
