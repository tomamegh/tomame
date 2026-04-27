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
   * Fetch an image through a real browser session so we can bypass CDN-level
   * bot protection (e.g. productimages.microcenter.com is gated by Cloudflare
   * challenge). We first navigate to the site's origin to clear the challenge,
   * then use browser-native fetch (inheriting cookies) to grab the image bytes.
   */
  public async fetchImageViaBrowser(
    imageUrl: string,
    originUrl: string,
    timeoutMs: number = 30000,
  ): Promise<{ bytes: Buffer; contentType: string } | { error: string }> {
    const apiKey = getApiKey();

    // Runs inside browserless's Chromium (ES module form).
    // First navigate to the origin to clear any Cloudflare challenge and acquire
    // session cookies, then navigate to the image URL so the browser downloads
    // it with those cookies — response.buffer() hands back the raw bytes.
    const code = `
      export default async function ({ page, context }) {
        const { imageUrl, originUrl } = context;
        await page.goto(originUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        const response = await page.goto(imageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!response.ok()) return { error: 'status-' + response.status() };
        const buf = await response.buffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return { b64: btoa(binary), contentType: response.headers()['content-type'] || 'image/jpeg' };
      }
    `;

    try {
      const response = await fetch(`${this.apiUrl}/function?token=${apiKey}&stealth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, context: { imageUrl, originUrl } }),
        signal: AbortSignal.timeout(timeoutMs + 5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.error("browserless fetchImageViaBrowser failed", {
          imageUrl,
          status: response.status,
          error: errorText,
        });
        return { error: `browserless ${response.status}: ${errorText.slice(0, 200)}` };
      }

      const data = await response.json() as { b64?: string; contentType?: string; error?: string } | null;
      if (data?.error) {
        logger.warn("browserless fetchImageViaBrowser upstream error", { imageUrl, error: data.error });
        return { error: `upstream ${data.error}` };
      }
      if (!data?.b64 || !data?.contentType) {
        logger.warn("browserless fetchImageViaBrowser returned no data", { imageUrl });
        return { error: "empty response" };
      }

      return {
        bytes: Buffer.from(data.b64, "base64"),
        contentType: data.contentType,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("browserless fetchImageViaBrowser exception", { imageUrl, error: message });
      return { error: `exception: ${message}` };
    }
  }

  /**
   * Use browserless's /unblock endpoint — purpose-built for Cloudflare-protected
   * pages. Higher success rate than /content?stealth for sites that repeatedly
   * serve the challenge page (e.g. microcenter.com).
   */
  public async unblockContent(url: string, timeoutMs: number = 30000): Promise<ScrapeContentResult> {
    const apiKey = getApiKey();
    try {
      const response = await fetch(`${this.apiUrl}/chromium/unblock?token=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          content: true,
          cookies: false,
          screenshot: false,
          browserWSEndpoint: false,
          ttl: 0,
        }),
        signal: AbortSignal.timeout(timeoutMs + 5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.warn("browserless unblock failed", { url, status: response.status, error: errorText });
        return { success: false, html: null, error: `Browserless unblock ${response.status}: ${errorText}` };
      }

      const body = await response.json() as { content?: string | null } | null;
      const html = body?.content ?? null;
      if (!html) {
        return { success: false, html: null, error: "Empty unblock content" };
      }
      return { success: true, html, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("browserless unblock exception", { url, error: message });
      return { success: false, html: null, error: message };
    }
  }

  /**
   * Fetch the fully-rendered HTML content of a page.
   */
  public async scrapeContent(options: ScrapeContentOptions): Promise<ScrapeContentResult> {
    const { url, timeout = 20000, waitForSelector } = options;
    const apiKey = getApiKey();

    try {
      const body: Record<string, unknown> = {
        url,
        bestAttempt: true,
        gotoOptions: {
          waitUntil: "domcontentloaded",
          timeout,
        },
        // Stealth flags to avoid bot detection
        setExtraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        setJavaScriptEnabled: true,
      };

      if (waitForSelector) {
        body.waitForSelector = {
          selector: waitForSelector,
          timeout,
        };
      }

      const response = await fetch(`${this.apiUrl}/content?token=${apiKey}&stealth`, {
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
