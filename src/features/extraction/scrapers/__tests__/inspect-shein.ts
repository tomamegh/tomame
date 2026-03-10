import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const html = readFileSync(resolve(__dirname, "fixtures", "shein-shirt-set.html"), "utf-8");
const $ = cheerio.load(html);

// JSON-LD
const jsonLd: unknown[] = [];
$('script[type="application/ld+json"]').each((_, el) => {
  try { jsonLd.push(JSON.parse($(el).html() ?? "")); } catch {}
});
console.log("=== JSON-LD blocks ===");
console.log(JSON.stringify(jsonLd, null, 2).substring(0, 3000));

console.log("\n=== Meta tags ===");
console.log("og:title:", $('meta[property="og:title"]').attr("content"));
console.log("og:price:", $('meta[property="product:price:amount"]').attr("content"));
console.log("og:currency:", $('meta[property="product:price:currency"]').attr("content"));
console.log("og:image:", $('meta[property="og:image"]').attr("content")?.substring(0, 200));
console.log("og:description:", $('meta[property="og:description"]').attr("content")?.substring(0, 200));

console.log("\n=== Title ===");
console.log("h1:", $("h1").first().text().trim().substring(0, 200));
console.log("title:", $("title").text().trim().substring(0, 200));

console.log("\n=== Breadcrumbs ===");
$("nav a, .breadcrumb a").each((i, el) => {
  if (i < 10) console.log(`  [${i}]`, $(el).text().trim());
});

console.log("\n=== Product data in window/global scripts ===");
const patterns = ["productIntroData", "goodsDetailV3", "_GB_DATA_", "goods_id", "cat_id", "productDetailData"];
$("script").each((_, el) => {
  const text = $(el).html() ?? "";
  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx !== -1) {
      console.log(`Found "${p}" at char ${idx}:`);
      console.log(text.substring(Math.max(0, idx - 20), idx + 300));
      console.log("---");
    }
  }
});

// Check for color/size selectors
console.log("\n=== Color/Size elements ===");
$('[class*="color"], [class*="Color"], [data-attr-id]').each((i, el) => {
  if (i < 5) console.log(`  color: class=${$(el).attr("class")} text=${$(el).text().trim().substring(0, 100)}`);
});
$('[class*="size"], [class*="Size"]').each((i, el) => {
  if (i < 5) console.log(`  size: class=${$(el).attr("class")} text=${$(el).text().trim().substring(0, 100)}`);
});
