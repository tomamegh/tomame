/**
 * Records the AI price finder preview's fixture from real data:
 * `src/features/finder/fixtures/recorded-run.json`.
 *
 *   docker start supabase_db_tomame        # the local DB only; nothing else is needed
 *   npx tsx scripts/finder-record-fixture.ts
 *
 * What is real: every listing (title, store, URL, image, listed price, condition,
 * store shipping) is a `catalog_products` row in the local DB, and every GH₵
 * figure comes out of `PricingCalculator` fed with the local DB's pricing
 * constants, category map, fixed-freight items and USD rate.
 *
 * What is not: the finder backend does not exist yet, so the shortlist is a set
 * of plain rules standing in for the Haiku step, and the event timings are
 * scripted to the plan's 30–90 s estimate. The one deliberate override is the
 * Tomame fee: production has charged 4% on every group since 2026-11-19 and the
 * owner accepted that wording; the local DB still holds the older per-group
 * percentages, so every group is priced at 4% here.
 *
 * `server-only` is resolved to Next's own empty build, as a server bundle
 * would. The calculator is handed every input up front, so it never opens a
 * connection; the placeholder Supabase env below only satisfies module load.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return nextResolve("next/dist/compiled/server-only/empty.js", context);
    return nextResolve(specifier, context);
  },
});

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY ??= "not-used-by-this-script";

const CONTAINER = "supabase_db_tomame";
const OUT = path.resolve(__dirname, "../src/features/finder/fixtures/recorded-run.json");

const QUERY = "Noise-cancelling headphones under GH₵1,500";
const BUDGET_GHS = 1500;
const CATEGORY = "Headphones";
const FEE_PCT = 0.04;
const SEARCHED_STORES = [
  { id: "amazon", name: "Amazon" },
  { id: "walmart", name: "Walmart" },
  { id: "ebay", name: "eBay" },
] as const;

const NOT_FOUND_QUERY = "PS5 Slim digital";
const NOT_FOUND_PATTERN = "(ps5|playstation ?5|playstation®5)";

function sql<T>(query: string): T {
  const out = execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", query],
    { encoding: "utf8" },
  ).trim();
  return JSON.parse(out || "null") as T;
}

interface ListingRow {
  id: string;
  store: string;
  title: string;
  product_url: string;
  image_url: string | null;
  price_usd: number;
  condition_group: string | null;
  raw: { condition?: string; shipping_cost?: string; seller_name?: string } | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "+$8.13 delivery" → 8.13; "Free delivery" or anything unreadable → 0. */
function parseShipping(text: string | undefined): number {
  const m = text?.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  return m ? Number(m[1]) : 0;
}

/** eBay serves the same photo at several sizes; the catalogue stored the 140 px thumbnail. */
function largerImage(url: string | null): string | null {
  return url ? url.replace(/\/s-l\d+\./, "/s-l500.") : null;
}

function cedis(n: number): string {
  return `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cedisCompact(n: number): string {
  return Number.isInteger(n) ? `GH₵${n.toLocaleString("en-GH")}` : cedis(n);
}

/** "Soundcore by Anker Q20i Hybrid Active Noise…" → "Soundcore by Anker Q20i": brand and model, before the feature words. */
function shortName(title: string): string {
  const cut = title.search(/[,|(]|\s-\s|\b(hybrid|active|adaptive|anc|noise|over-?ear|wireless|bluetooth)\b/i);
  return (cut > 0 ? title.slice(0, cut) : title).replace(/\s+/g, " ").trim();
}

/** eBay sellers named like the brand's own store ("ankerdirect", "belkin-official-store"). */
function isBrandStore(seller: string | undefined): boolean {
  return /official|direct/i.test(seller ?? "");
}

async function main() {
  const { PricingCalculator } = await import("../src/lib/pricing/calculator");

  const constants = sql<Record<string, number>>(
    "select json_object_agg(key, value::float8) from pricing_constants",
  );
  const groups = sql<Array<Record<string, unknown> & { tomame_category: string }>>(
    `select json_agg(json_build_object(
       'tomame_category', m.tomame_category, 'id', g.id, 'slug', g.slug, 'name', g.name,
       'flat_rate_ghs', g.flat_rate_ghs::float8, 'flat_rate_expression', g.flat_rate_expression,
       'value_percentage', g.value_percentage::float8, 'value_percentage_high', g.value_percentage_high::float8,
       'value_threshold_usd', g.value_threshold_usd::float8, 'default_weight_lbs', g.default_weight_lbs::float8,
       'requires_weight', g.requires_weight, 'is_active', g.is_active, 'sort_order', g.sort_order))
     from category_pricing_map m join pricing_groups g on g.id = m.pricing_group_id`,
  );
  const fixed = sql<unknown[] | null>(
    `select json_agg(json_build_object('id', id, 'category', category, 'product_name', product_name,
       'freight_rate_ghs', freight_rate_ghs::float8, 'keywords', keywords, 'sort_order', sort_order))
     from fixed_freight_items where is_active`,
  ) ?? [];
  const usd = sql<{ rate: number; provider: string; fetched_at: string }>(
    "select json_build_object('rate', rate::float8, 'provider', provider, 'fetched_at', fetched_at) from exchange_rates where base_currency = 'USD' and target_currency = 'GHS'",
  );
  const listings = sql<ListingRow[]>(
    `select json_agg(json_build_object('id', id, 'store', store, 'title', title, 'product_url', product_url,
       'image_url', image_url, 'price_usd', price_usd::float8, 'condition_group', condition_group, 'raw', raw)
       order by price_usd)
     from catalog_products where category = '${CATEGORY}' and price_usd is not null`,
  );
  const notFoundCount = sql<number>(
    `select count(*) from catalog_products where title ~* '${NOT_FOUND_PATTERN}'`,
  );

  const map = new Map<string, never>();
  for (const g of groups) {
    const { tomame_category, ...row } = g;
    map.set(tomame_category, { ...row, value_percentage: FEE_PCT, value_percentage_high: null } as never);
  }
  const calc = new PricingCalculator();
  calc.setConstants({ ...constants, default_value_fee_pct: FEE_PCT });
  calc.setCategoryPricing(map);
  calc.setFixedFreightItems(fixed as never);
  calc.useGhsRates({ USD: usd.rate });

  // ── Shortlist: plain rules standing in for the Haiku step ────────────────
  const dropped = { notNew: 0, noAnc: 0, notOverEar: 0, unbranded: 0, overBudget: 0 };
  const matches: ListingRow[] = [];
  for (const row of listings) {
    if (row.condition_group !== "new") dropped.notNew++;
    else if (!/\bANC\b|noise[\s-]?cancel/i.test(row.title)) dropped.noAnc++;
    else if (/earbud|earphone|in-ear|on-ear|closed-stick/i.test(row.title)) dropped.notOverEar++;
    else if (/^(new\s+)?(wireless|bluetooth)\b/i.test(row.title)) dropped.unbranded++;
    else matches.push(row);
  }

  const priced = [];
  for (const row of matches) {
    const shipping = parseShipping(row.raw?.shipping_cost);
    const b = await calc.calculate({
      itemPriceUsd: row.price_usd,
      quantity: 1,
      category: CATEGORY,
      productTitle: row.title,
      region: "usa",
      storeShipping: shipping,
    }, null);
    if (b.pricing_method === "needs_review") throw new Error(`Calculator could not price ${row.id}: ${b.review_reason}`);

    const tax = r2(b.tax_usd * b.exchange_rate);
    const fee = r2(b.value_fee_usd * b.exchange_rate);
    const ship = b.store_shipping_ghs ?? 0;
    // Each USD line converted on its own can miss the calculator's single
    // conversion by a pesewa; the item line absorbs it so the rows add up.
    const item = r2(b.total_ghs - b.flat_rate_ghs - tax - fee - ship);
    const rows = [
      { key: "item", label: "Item", amountGhs: item, note: `$${b.item_price_usd.toFixed(2)} at GH₵${b.exchange_rate.toFixed(2)} to the dollar` },
      { key: "tax", label: "US sales tax", amountGhs: tax, note: `$${b.tax_usd.toFixed(2)}` },
      { key: "fee", label: "Tomame fee – 4% flat on the item price", amountGhs: fee, note: `$${b.value_fee_usd.toFixed(2)}` },
      ...(ship > 0 ? [{ key: "store_shipping", label: "Store shipping to our US hub", amountGhs: ship, note: `$${(b.store_shipping_usd ?? 0).toFixed(2)}` }] : []),
      { key: "freight", label: "Freight, incl. customs & clearance", amountGhs: b.flat_rate_ghs, note: b.pricing_method === "flat_rate" ? "Flat rate for headphones" : b.fee_calculation_note },
      { key: "customs", label: "Customs & clearance – Included in freight – GH₵0 extra", amountGhs: 0 },
    ];
    priced.push({ row, breakdown: b, rows, shipping });
  }

  const withinBudget = priced.filter((p) => p.breakdown.total_ghs <= BUDGET_GHS)
    .sort((a, b) => a.breakdown.total_ghs - b.breakdown.total_ghs);
  dropped.overBudget = priced.length - withinBudget.length;
  const [best, alt1, alt2, runnerUpOutside] = withinBudget;
  if (!best || !alt1 || !alt2) throw new Error(`Only ${withinBudget.length} priced matches within budget; the preview needs 3`);
  const top = [best, alt1, alt2];
  const alts = [alt1, alt2] as const;

  const candidate = (p: (typeof top)[number]) => ({
    id: p.row.id,
    title: p.row.title,
    store: SEARCHED_STORES.find((s) => s.id === p.row.store) ?? { id: p.row.store, name: p.row.store },
    productUrl: p.row.product_url,
    imageUrl: largerImage(p.row.image_url),
    condition: "New" as const,
    listingPriceUsd: p.row.price_usd,
    seller: p.row.raw?.seller_name ?? null,
  });
  const quote = (p: (typeof top)[number]) => ({
    totalGhs: p.breakdown.total_ghs,
    totalUsd: p.breakdown.total_usd ?? r2(p.breakdown.total_ghs / p.breakdown.exchange_rate),
    exchangeRate: p.breakdown.exchange_rate,
    rows: p.rows,
  });

  const gap = (p: (typeof top)[number]) => r2(p.breakdown.total_ghs - best.breakdown.total_ghs);
  const brandStore = (p: (typeof top)[number]) =>
    isBrandStore(p.row.raw?.seller_name) ? " Sold by the brand's own eBay store." : "";
  const why: Record<string, string> = {
    [best.row.id]: `Lowest landed total of the ${withinBudget.length} new noise-cancelling over-ear pairs within your budget. The ${shortName(alts[0].row.title)} pair is ${cedis(gap(alts[0]))} more with the same freight.${brandStore(best)}`,
    [alts[0].row.id]: `${cedis(gap(alts[0]))} more than the ${shortName(best.row.title)}. Same flat freight, so the difference is the store price.${brandStore(alts[0])}`,
    [alts[1].row.id]: `${cedis(gap(alts[1]))} more than the lowest.${brandStore(alts[1])}${
      runnerUpOutside
        ? ` The ${shortName(runnerUpOutside.row.title)} came next at ${cedis(runnerUpOutside.breakdown.total_ghs)}: its seller adds $${runnerUpOutside.shipping.toFixed(2)} shipping.`
        : ""
    }`,
  };

  const total = listings.length;
  const freightGhs = best.breakdown.flat_rate_ghs;

  // ── The recorded event stream ─────────────────────────────────────────────
  const found = [
    { type: "run_started", at: 0, query: QUERY, budgetGhs: BUDGET_GHS },
    { type: "step_started", at: 300, step: "understand", label: "Reading your request" },
    { type: "spec_parsed", at: 2600, spec: { product: "Noise-cancelling headphones", mustHaves: ["Over-ear", "Active noise cancelling"], budgetGhs: BUDGET_GHS, newOnly: true } },
    { type: "step_done", at: 2700, step: "understand", summary: "Over-ear, noise-cancelling, new, up to GH₵1,500 landed" },
    { type: "step_started", at: 3000, step: "search", label: "Searching Amazon, Walmart and eBay" },
    ...SEARCHED_STORES.map((s, i) => ({ type: "store_search_started", at: 3200 + i * 500, store: s })),
    ...SEARCHED_STORES.map((s, i) => ({
      type: "store_search_done",
      at: 9000 + i * 2600,
      storeId: s.id,
      listings: listings.filter((l) => l.store === s.id).length,
    })),
    { type: "step_done", at: 14600, step: "search", summary: `Found ${total} listings across 3 stores` },
    { type: "step_started", at: 14900, step: "shortlist", label: "Setting aside anything that is not an exact match" },
    ...top.map((p, i) => ({ type: "candidate_found", at: 18500 + i * 1400, candidate: candidate(p) })),
    {
      type: "step_done", at: 22400, step: "shortlist",
      summary: `${matches.length} of ${total} are new, over-ear and noise-cancelling`,
      details: [
        `${dropped.notNew} not sold as new`,
        `${dropped.notOverEar + dropped.noAnc} earbuds, on-ear or no noise cancelling`,
        `${dropped.unbranded} unbranded`,
      ],
    },
    { type: "step_started", at: 22700, step: "price", label: "Checking each price at the store" },
    ...top.flatMap((p, i) => [
      { type: "price_check_started", at: 23000 + i * 9000, candidateId: p.row.id },
    ]),
    { type: "step_done", at: 50000, step: "price", summary: "All 3 prices confirmed at the store" },
    { type: "step_started", at: 30000, step: "freight", label: "Working out freight to Accra" },
    ...top.map((p, i) => ({
      type: "candidate_priced",
      at: 31500 + i * 9000,
      candidateId: p.row.id,
      quote: quote(p),
      stockCheck: false,
    })),
    { type: "step_done", at: 50200, step: "freight", summary: `Headphones ship at a flat ${cedisCompact(freightGhs)}, customs and clearance included` },
    { type: "step_started", at: 50500, step: "compare", label: "Comparing landed totals" },
    { type: "step_done", at: 55800, step: "compare", summary: `${withinBudget.length} fit your budget, ${dropped.overBudget} were over it. Ranked by landed total.` },
    { type: "result_ready", at: 56000, bestId: best.row.id, alternativeIds: alts.map((a) => a.row.id), why },
  ].sort((a, b) => a.at - b.at);

  const notFound = [
    { type: "run_started", at: 0, query: NOT_FOUND_QUERY, budgetGhs: null },
    { type: "step_started", at: 300, step: "understand", label: "Reading your request" },
    { type: "spec_parsed", at: 2400, spec: { product: "PlayStation 5 Slim", mustHaves: ["Digital Edition"], budgetGhs: null, newOnly: true } },
    { type: "step_done", at: 2500, step: "understand", summary: "PS5 Slim, Digital Edition, new" },
    { type: "step_started", at: 2800, step: "search", label: "Searching Amazon, Walmart and eBay" },
    ...SEARCHED_STORES.map((s, i) => ({ type: "store_search_started", at: 3000 + i * 500, store: s })),
    ...SEARCHED_STORES.map((s, i) => ({ type: "store_search_done", at: 8000 + i * 2200, storeId: s.id, listings: 0 })),
    { type: "step_done", at: 12600, step: "search", summary: `No listings in ${notFoundCount === 0 ? "any of the 3 stores" : "stock"}` },
    {
      type: "nothing_found", at: 13000,
      message: "We searched Amazon, Walmart and eBay and found no new PS5 Slim Digital Edition we can buy and ship for you.",
      whatsappText: `Hi Tomame, please help me find this: ${NOT_FOUND_QUERY} (new).`,
    },
  ].sort((a, b) => a.at - b.at);

  const fixture = {
    meta: {
      producedBy: "scripts/finder-record-fixture.ts",
      producedAt: new Date().toISOString(),
      howProduced: [
        `Listings: ${total} catalog_products rows in category "${CATEGORY}" from the local Supabase DB (last seen ${"2026-09-14"}). Titles, stores, URLs, listed prices, conditions and store shipping are as stored; eBay thumbnails are requested at 500 px instead of 140 px.`,
        "Prices: every GH₵ figure is PricingCalculator.calculate() over the local DB's pricing_constants, category_pricing_map, fixed_freight_items and USD rate.",
        "Override: the Tomame fee is 4% on every group, as production has charged since 2026-11-19; the local DB still holds older per-group percentages.",
        "Not real yet: the shortlist is plain title/condition rules standing in for the Haiku step, and event timings are scripted to the plan's 30–90 s estimate. The nothing-found run reflects a catalogue with no PS5 listings.",
      ],
      exchangeRate: { usdGhsMidMarket: usd.rate, provider: usd.provider, fetchedAt: usd.fetched_at, applied: best.breakdown.exchange_rate },
      catalogueRowIds: top.map((p) => p.row.id),
      shortlist: { listings: total, matches: matches.length, withinBudget: withinBudget.length, dropped },
    },
    runs: { found, notFound },
  };

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
  for (const p of top) console.log(`  ${cedis(p.breakdown.total_ghs)}  ${p.row.title}`);
  console.log(`  shortlist`, fixture.meta.shortlist);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
