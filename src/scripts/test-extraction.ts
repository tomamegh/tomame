/**
 * Quick test script for the product extraction service.
 * Run: bun run src/scripts/test-extraction.ts
 */
import { extractProductData } from "@/features/extraction/extraction.service";

const TEST_URLS = [
  "https://www.amazon.com/dp/B09XS7JWHH",
  "https://www.ebay.com/itm/125943210241",
  "https://www.aliexpress.com/item/1005006123456789.html",
];

async function main() {
  const url = process.argv[2] || TEST_URLS[0]!;

  console.log(`\n🔍 Extracting product data from: ${url}\n`);

  const result = await extractProductData(url);

  if (!result.success) {
    console.error("❌ Service error:", result.error);
    process.exit(1);
  }

  const data = result.data;

  console.log("── Result ──────────────────────────────────");
  console.log(`Extraction attempted: ${data.extractionAttempted}`);
  console.log(`Extraction success:   ${data.extractionSuccess}`);
  console.log(`HTTP status:          ${data.responseStatus}`);
  console.log(`Fetched at:           ${data.fetchedAt}`);
  console.log("");

  console.log("── Fields ──────────────────────────────────");
  for (const [key, field] of Object.entries(data.fields)) {
    const val = field.value ?? "(not found)";
    const src = field.source ?? "—";
    const conf = field.confidence ?? "—";
    const extra = "currency" in field && field.currency ? ` [${field.currency}]` : "";
    console.log(`  ${key.padEnd(10)} ${String(val).substring(0, 60).padEnd(62)} source=${src}  confidence=${conf}${extra}`);
  }

  if (data.errors.length > 0) {
    console.log("\n── Errors ──────────────────────────────────");
    for (const err of data.errors) {
      console.log(`  ⚠ ${err}`);
    }
  }

  console.log("");
}

main().catch(console.error);
