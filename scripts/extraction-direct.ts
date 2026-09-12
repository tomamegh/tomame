/**
 * Direct chain bench — runs `resolveProduct` in-process with real vendor keys
 * and prints per-tier timings. No dev server, no DB (the learned category map
 * is skipped; the classifier still runs).
 *
 *   npx tsx --env-file=.env.local scripts/extraction-direct.ts <url> [<url>…]
 */
import { resolveProduct } from "@/features/extraction/resolvers/chain";
import { storeForUrl } from "@/features/extraction/stores";
import { getScraperForStore } from "@/features/extraction/scrapers";

const urls = process.argv.slice(2).filter((a) => a.startsWith("http"));
if (urls.length === 0) {
  console.error("usage: npx tsx --env-file=.env.local scripts/extraction-direct.ts <url>…");
  process.exit(1);
}

(async () => {
  for (const raw of urls) {
    const store = storeForUrl(raw);
    if (!store) {
      console.log(`${raw}: not a usable store URL`);
      continue;
    }
    const scraper = getScraperForStore(store);
    const url = scraper.canonicalUrl(raw);
    const t0 = Date.now();
    const out = await resolveProduct({ url, platform: store.slug, region: store.region, store, stopWhenRequired: true });
    const p = out.product;
    console.log(`\n${store.slug}  ${Date.now() - t0} ms  ${url}`);
    console.log(`  title: ${p.title?.slice(0, 70) ?? "-"}`);
    console.log(`  price: ${p.price != null ? `${p.currency} ${p.price}` : "-"}   category: ${p.category ?? "-"}   weight_lbs: ${p.weight_lbs ?? "-"}`);
    console.log(`  ran: ${out.ran.join(", ") || "-"}   skipped: ${out.skipped.join(", ") || "-"}   html: ${out.htmlSource ?? "-"}`);
    console.log(`  timings: ${Object.entries(out.timings).map(([k, v]) => `${k}=${v}ms`).join("  ")}`);
    if (out.messages.length) console.log(`  messages: ${out.messages.join(" | ")}`);
  }
})();
