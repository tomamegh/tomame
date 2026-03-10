import { logger } from "@/lib/logger";

const BROWSERLESS_API_URL = "https://production-sfo.browserless.io";

function getApiKey(): string {
  const key = process.env.BROWSERLESS_API_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: BROWSERLESS_API_KEY");
  }
  return key;
}

interface ScrapeContentOptions {
  /** URL to scrape */
  url: string;
  /** Timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** Wait for a specific selector before returning (e.g. "#productTitle") */
  waitForSelector?: string;
  /** Enable stealth mode to bypass bot detection (e.g. Walmart PerimeterX) */
  stealth?: boolean;
}

interface ScrapeContentResult {
  success: boolean;
  html: string | null;
  error: string | null;
}

/**
 * Browserless.io client wrapper.
 *
 * Uses the /content endpoint to fetch fully-rendered HTML
 * from a headless Chrome browser.
 */
export class BrowserlessClient {
  private apiUrl: string;

  constructor(apiUrl: string = BROWSERLESS_API_URL) {
    this.apiUrl = apiUrl;
  }

  /**
   * Fetch the fully-rendered HTML content of a page.
   */
  public async scrapeContent(options: ScrapeContentOptions): Promise<ScrapeContentResult> {
    const { url, timeout = 15000, waitForSelector, stealth = false } = options;
    const apiKey = getApiKey();

    try {
      const body: Record<string, unknown> = {
        url,
        gotoOptions: {
          waitUntil: "networkidle2",
          timeout,
        },
      };

      if (waitForSelector) {
        body.waitForSelector = {
          selector: waitForSelector,
          timeout,
        };
      }

      const stealthParam = stealth ? "&stealth" : "";
      const response = await fetch(`${this.apiUrl}/content?token=${apiKey}${stealthParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout + 5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.error("browserless scrapeContent failed", {
          url,
          status: response.status,
          error: errorText,
        });
        return {
          success: false,
          html: null,
          error: `Browserless error ${response.status}: ${errorText}`,
        };
      }

      const html = await response.text();
      return { success: true, html, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("browserless scrapeContent exception", { url, error: message });
      return { success: false, html: null, error: message };
    }
  }
}

/** Singleton instance for server-side use only */
export const browserlessClient = new BrowserlessClient();
