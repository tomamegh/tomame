/**
 * Fetch a SHEIN product page via Browserless stealth mode.
 * Usage: npx tsx src/features/extraction/scrapers/__tests__/fetch-shein-fixture.ts
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
if (!BROWSERLESS_API_KEY) {
  console.error("Missing BROWSERLESS_API_KEY in .env");
  process.exit(1);
}

async function fetchShein() {
  const url =
    "https://m.shein.com/Manfinity-RSRT-Men-Solid-Button-Up-Shirt-Shorts-Set-Vacation-Plain-Husband-Casual-Clothes-p-15637824.html";

  console.log(`Fetching via Browserless (stealth): ${url}`);

  const body = {
    url,
    gotoOptions: {
      waitUntil: "networkidle2",
      timeout: 30000,
    },
    waitForSelector: {
      selector: "h1, .product-intro__head-name, .goods-detail__title, title",
      timeout: 20000,
    },
  };

  const response = await fetch(
    `https://production-sfo.browserless.io/content?token=${BROWSERLESS_API_KEY}&stealth`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(`Browserless error ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const html = await response.text();
  console.log(`HTML length: ${html.length}`);
  console.log(`Has __NEXT_DATA__: ${html.includes("__NEXT_DATA__")}`);
  console.log(`Has ld+json: ${html.includes("application/ld+json")}`);
  console.log(`Has gbProductInfo: ${html.includes("productIntroData") || html.includes("gbProductInfo")}`);
  console.log(`Has CAPTCHA: ${html.includes("Robot or human") || html.includes("captcha")}`);

  const outPath = resolve(__dirname, "fixtures", "shein-shirt-set.html");
  writeFileSync(outPath, html, "utf-8");
  console.log(`Saved fixture: ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
}

fetchShein().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
