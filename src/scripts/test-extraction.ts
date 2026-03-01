/**
 * Quick test script for the product extraction service.
 *
 * Usage:
 *   bun run src/scripts/test-extraction.ts [URL]
 *   bun run src/scripts/test-extraction.ts --puppeteer [URL]   # force Puppeteer
 *   bun run src/scripts/test-extraction.ts --all               # test all URLs
 */
import { extractProductData } from "@/features/extraction/extraction.service";

const TEST_URLS = [
  "https://www.amazon.com/dp/B0D1XD1ZV3",
  "https://www.ebay.com/itm/235283659498",
  "https://www.aliexpress.com/item/1005007403795080.html",
];

async function testUrl(url: string, forcePuppeteer: boolean) {
  console.log(`\n🔍 Extracting product data from: ${url}`);
  if (forcePuppeteer) console.log("   (Puppeteer forced)\n");
  else console.log("");

  const start = performance.now();
  const result = await extractProductData(url, { forcePuppeteer });
  const elapsed = ((performance.now() - start) / 1000).toFixed(1);

  if (!result.success) {
    console.error("❌ Service error:", result.error);
    return;
  }

  const data = result.data;

  console.log("── Result ──────────────────────────────────");
  console.log(`Extraction attempted: ${data.extractionAttempted}`);
  console.log(`Extraction success:   ${data.extractionSuccess}`);
  console.log(`Used Puppeteer:       ${data.usedPuppeteer}`);
  console.log(`HTTP status:          ${data.responseStatus}`);
  console.log(`Time:                 ${elapsed}s`);
  console.log(`Fetched at:           ${data.fetchedAt}`);
  console.log("");

  console.log("── Fields ──────────────────────────────────");
  for (const [key, field] of Object.entries(data.fields)) {
    const val = field.value ?? "(not found)";
    const src = field.source ?? "—";
    const conf = field.confidence ?? "—";
    const extra =
      "currency" in field && field.currency ? ` [${field.currency}]` : "";
    console.log(
      `  ${key.padEnd(10)} ${String(val).substring(0, 60).padEnd(62)} source=${src}  confidence=${conf}${extra}`,
    );
  }

  if (data.errors.length > 0) {
    console.log("\n── Errors ──────────────────────────────────");
    for (const err of data.errors) {
      console.log(`  ⚠ ${err}`);
    }
  }

  console.log("");
}

async function main() {
  const args = process.argv.slice(2);
  const forcePuppeteer = args.includes("--puppeteer");
  const testAll = args.includes("--all");
  const urlArgs = args.filter((a) => !a.startsWith("--"));

  if (testAll) {
    for (const url of TEST_URLS) {
      await testUrl(url, forcePuppeteer);
    }
  } else {
    const url = urlArgs[0] || TEST_URLS[0]!;
    await testUrl(url, forcePuppeteer);
  }
}

main().catch(console.error);
