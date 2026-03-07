import puppeteer, { type Browser } from "puppeteer";
import { logger } from "@/lib/logger";

// ── Singleton browser instance ──────────────────────────────

let browser: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const NAVIGATION_TIMEOUT_MS = 20_000; // 20 seconds
const SETTLE_DELAY_MS = 5_000; // 5 seconds extra wait for JS rendering

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) {
    resetIdleTimer();
    return browser;
  }

  logger.info("Launching Puppeteer browser");
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--no-first-run",
    ],
  });

  resetIdleTimer();
  return browser;
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browser) {
      logger.info("Closing idle Puppeteer browser");
      await browser.close().catch(() => {});
      browser = null;
    }
  }, IDLE_TIMEOUT_MS);
}

// ── Public API ──────────────────────────────────────────────

/**
 * Fetches a URL using a headless browser and returns the fully-rendered HTML.
 * Uses a singleton browser with lazy init and 5-minute idle auto-close.
 */
export async function fetchRenderedHtml(url: string): Promise<string> {
  const instance = await getBrowser();
  const page = await instance.newPage();

  try {
    // Stealth-like setup: realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    });

    // Navigate and wait for network to settle
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // Extra wait for JS-rendered content to settle
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));

    const html = await page.content();
    return html;
  } finally {
    await page.close().catch(() => {});
  }
}
