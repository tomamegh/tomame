import { logger } from "@/lib/logger";

const SCRAPINGBEE_API_URL = "https://app.scrapingbee.com/api/v1/";

function getApiKey(): string {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: SCRAPINGBEE_API_KEY");
  }
  return key;
}

interface ScrapingBeeOptions {
  /** URL to scrape */
  url: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable JavaScript rendering (default: true, costs 5 credits) */
  renderJs?: boolean;
  /** Use premium proxies for harder sites (costs 25 credits) */
  premiumProxy?: boolean;
  /** Use stealth proxies for hardest sites like Costco/Akamai (costs 75 credits) */
  stealthProxy?: boolean;
  /** Wait for a CSS selector to appear before returning */
  waitForSelector?: string;
  /** Wait N milliseconds after page load */
  wait?: number;
  /** Country code for geo-targeted proxy (e.g. "us") */
  countryCode?: string;
}

interface ScrapingBeeResult {
  success: boolean;
  html: string | null;
  error: string | null;
}

/**
 * ScrapingBee API client.
 *
 * Used for sites with aggressive bot protection (e.g. Costco / Akamai)
 * that browserless.io cannot bypass.
 */
export class ScrapingBeeClient {
  private apiUrl: string;

  constructor(apiUrl: string = SCRAPINGBEE_API_URL) {
    this.apiUrl = apiUrl;
  }

  public async scrape(options: ScrapingBeeOptions): Promise<ScrapingBeeResult> {
    const {
      url,
      timeout = 30000,
      renderJs = true,
      premiumProxy = false,
      stealthProxy = false,
      waitForSelector,
      wait,
      countryCode = "us",
    } = options;

    const apiKey = getApiKey();

    try {
      const params = new URLSearchParams({
        api_key: apiKey,
        url,
        render_js: String(renderJs),
        country_code: countryCode,
      });

      if (stealthProxy) {
        params.set("stealth_proxy", "true");
      } else if (premiumProxy) {
        params.set("premium_proxy", "true");
      }

      if (waitForSelector) {
        params.set("wait_for", waitForSelector);
      }

      if (wait != null) {
        params.set("wait", String(wait));
      }

      const response = await fetch(`${this.apiUrl}?${params.toString()}`, {
        method: "GET",
        signal: AbortSignal.timeout(timeout + 10000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.error("scrapingbee scrape failed", {
          url,
          status: response.status,
          error: errorText.slice(0, 200),
        });
        return {
          success: false,
          html: null,
          error: `ScrapingBee error ${response.status}: ${errorText.slice(0, 200)}`,
        };
      }

      const html = await response.text();
      return { success: true, html, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("scrapingbee scrape exception", { url, error: message });
      return { success: false, html: null, error: message };
    }
  }
}

/** Singleton instance for server-side use only */
export const scrapingBeeClient = new ScrapingBeeClient();
