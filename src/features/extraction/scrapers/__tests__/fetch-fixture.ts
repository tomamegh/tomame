/**
 * Fetch a product page via Browserless and save it as an HTML fixture.
 *
 * Usage:
 *   npx tsx src/features/extraction/scrapers/__tests__/fetch-fixture.ts <url> <fixture-name> [waitForSelector]
 *
 * Example:
 *   npx tsx src/features/extraction/scrapers/__tests__/fetch-fixture.ts \
 *     "https://www.amazon.com/dp/B0DSVMVYPH" \
 *     amazon-desk \
 *     "#productTitle"
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const url = process.argv[2];
const name = process.argv[3];
const waitForSelector = process.argv[4];

if (!url || !name) {
  console.error("Usage: fetch-fixture.ts <url> <fixture-name> [waitForSelector]");
  process.exit(1);
}

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
if (!BROWSERLESS_API_KEY) {
  console.error("Missing BROWSERLESS_API_KEY in .env");
  process.exit(1);
}

async function fetchFixture() {
  console.log(`Fetching via Browserless: ${url}`);
  if (waitForSelector) {
    console.log(`Waiting for selector: ${waitForSelector}`);
  }

  const body: Record<string, unknown> = {
    url,
    gotoOptions: {
      waitUntil: "networkidle2",
      timeout: 30000,
    },
  };

  if (waitForSelector) {
    body.waitForSelector = {
      selector: waitForSelector,
      timeout: 15000,
    };
  }

  const response = await fetch(
    `https://production-sfo.browserless.io/content?token=${BROWSERLESS_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(`Browserless error ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const html = await response.text();
  const outPath = resolve(__dirname, "fixtures", `${name}.html`);

  writeFileSync(outPath, html, "utf-8");
  console.log(`Saved fixture: ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
}

fetchFixture().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
