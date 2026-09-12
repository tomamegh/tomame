/**
 * Extraction bench — paste a set of real product links through the running
 * dev server and print per-store timings + what each tier contributed.
 *
 *   npm run dev            # in another terminal
 *   npx tsx scripts/extraction-bench.ts [baseUrl] [--fresh]
 *
 * `--fresh` appends a cache-busting query param so every URL is a cold run
 * (the param is stripped by URL canonicalisation for stores with a known id
 * shape, so for those the cache still applies — use a new product instead).
 */
const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";

const URLS: Array<[store: string, url: string]> = [
  ["amazon", "https://www.amazon.com/dp/B0CHX3QBCH"],
  ["amazon", "https://www.amazon.com/dp/B01MRZ02TL"],
  ["amazon-uk", "https://www.amazon.co.uk/dp/B0CHX3QBCH"],
  ["ebay", "https://www.ebay.com/itm/256374591433"],
  ["walmart", "https://www.walmart.com/ip/5253396052"],
  ["etsy", "https://www.etsy.com/listing/1857958157/handmade-full-grain-leather-wallet-the"],
  ["nike", "https://www.nike.com/t/air-force-1-07-mens-shoes-jBrhbr/CW2288-111"],
  ["shein", "https://us.shein.com/2026-Casual-Fashion-Elegant-Women-s-Dress-p-505744784.html"],
  ["target", "https://www.target.com/p/-/A-91936637"],
  ["bestbuy", "https://www.bestbuy.com/site/6525410.p"],
];

interface QuoteLike {
  extraction_success: boolean;
  cached?: boolean;
  source: string | null;
  sources: string[];
  platform: string | null;
  product: { title: string | null; price: number | null; currency: string | null; category: string | null; weight_lbs: number | null };
  pricing: { total_ghs?: number } | null;
  messages: string[];
}

async function quote(url: string): Promise<{ ms: number; status: number; data: QuoteLike | null; error: string | null }> {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/products/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_url: url }),
  });
  const body = (await res.json().catch(() => null)) as { data?: QuoteLike; error?: string } | null;
  return { ms: Date.now() - t0, status: res.status, data: body?.data ?? null, error: body?.error ?? null };
}

const pad = (s: unknown, n: number) => String(s ?? "").padEnd(n).slice(0, n);

(async () => {
  console.log(pad("store", 10), pad("ms", 7), pad("ok", 5), pad("cache", 6), pad("price", 12), pad("category", 26), pad("wt", 6), pad("src", 16), "title / message");
  const times: number[] = [];
  for (const [store, url] of URLS) {
    const r = await quote(url);
    if (r.data && !r.data.cached) times.push(r.ms);
    const d = r.data;
    console.log(
      pad(store, 10),
      pad(r.ms, 7),
      pad(d?.extraction_success ? "yes" : r.status, 5),
      pad(d?.cached ? "hit" : "miss", 6),
      pad(d?.product.price != null ? `${d.product.currency} ${d.product.price}` : "-", 12),
      pad(d?.product.category ?? "-", 26),
      pad(d?.product.weight_lbs ?? "-", 6),
      pad(d?.source ?? "-", 16),
      d?.product.title?.slice(0, 50) ?? r.error ?? d?.messages[0] ?? "",
    );
  }
  times.sort((a, b) => a - b);
  const p = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
  if (times.length) console.log(`\nfresh runs: ${times.length}  p50 ${p(0.5)} ms  p95 ${p(0.95)} ms  max ${times[times.length - 1]} ms`);
})();
