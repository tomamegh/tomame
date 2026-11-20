/**
 * Extraction accuracy audit (plan A0c): take the most recent Amazon / Walmart /
 * eBay quotes, re-read each URL through EVERY tier, and print per-tier
 * agreement with the consensus price plus how often the cached quote was right.
 *
 *   # No network, no database, no vendor spend — stub tiers over sample URLs:
 *   npx tsx scripts/extraction-accuracy-audit.ts --dry-run
 *
 *   # Live (spends vendor credits, metered in job_budgets 'accuracy-audit'):
 *   NODE_PATH=<dir holding a server-only stub> \
 *   node --env-file=.env.local --import tsx scripts/extraction-accuracy-audit.ts \
 *     [--limit 50] [--stores amazon,walmart,ebay]
 *
 * The server-only stub is a folder `server-only/` with an empty `index.js`
 * (see memory: extraction vendor paths). Each paid tier call costs one unit of
 * the monthly `accuracy-audit` budget (prod 600, elsewhere 20); when it runs
 * out the remaining paid tiers are skipped and the table says so. The weekly
 * cron the plan mentions is not wired: run it by hand until the numbers
 * justify the spend.
 */
import { createClient } from "@supabase/supabase-js";
import { ACCURACY_AUDIT_JOB } from "../src/config/quote-checks";
import { effectiveMonthlyCap, isProductionDeployment } from "../src/config/catalog";
import { formatAgreementTable, runAudit, type AuditDeps, type AuditSample, type TierReading } from "../src/features/extraction/audit/accuracy-audit";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY = flag("dry-run");
const LIMIT = Math.max(1, Math.min(500, Number(value("limit") ?? ACCURACY_AUDIT_JOB.defaultSample)));
const STORES = (value("stores") ?? "amazon,walmart,ebay").split(",").map((s) => s.trim()).filter(Boolean);

function period(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Dry run: canned samples and tiers that answer from a table ──────────────
const DRY_SAMPLES: AuditSample[] = [
  { url: "https://www.amazon.com/dp/B085WPHTHW", platform: "amazon", quotedPrice: 8355, quotedSource: "platform-html" },
  { url: "https://www.amazon.com/dp/B0DSVMVYPH", platform: "amazon", quotedPrice: 149.98, quotedSource: "scraperapi" },
  { url: "https://www.walmart.com/ip/5253396052", platform: "walmart", quotedPrice: 24.97, quotedSource: "zyte" },
  { url: "https://www.ebay.com/itm/256374591433", platform: "ebay", quotedPrice: 59.99, quotedSource: "ebay" },
];
const DRY_PRICES: Record<string, Record<string, number | null>> = {
  "https://www.amazon.com/dp/B085WPHTHW": { scraperapi: null, oxylabs: null, zyte: 83.55, rainforest: null, "platform-html": 83.55, "structured-data": null },
  "https://www.amazon.com/dp/B0DSVMVYPH": { scraperapi: 149.98, oxylabs: 149.98, zyte: 159.99, rainforest: null, "platform-html": 149.98, "structured-data": null },
  "https://www.walmart.com/ip/5253396052": { oxylabs: null, zyte: 24.97, "structured-data": 24.97 },
  "https://www.ebay.com/itm/256374591433": { ebay: 59.99, scraperapi: 59.99, "platform-html": 61.5, "structured-data": 59.99 },
};

function dryDeps(): AuditDeps {
  let used = 0;
  const cap = ACCURACY_AUDIT_JOB.monthlyCaps.other;
  return {
    tiersFor: (platform) => (platform === "amazon" ? ["scraperapi", "oxylabs", "zyte", "rainforest", "platform-html", "structured-data"] : platform === "walmart" ? ["oxylabs", "zyte", "structured-data"] : ["ebay", "scraperapi", "platform-html", "structured-data"]),
    isPaid: (tier) => tier !== "structured-data",
    runTier: async (sample, tier): Promise<TierReading> => ({ tier, price: DRY_PRICES[sample.url]?.[tier] ?? null, currency: "USD", ms: 0 }),
    spend: async () => ++used <= cap,
    log: (l) => console.log(l),
  };
}

// ── Live: recent quotes from extraction_cache, real tiers, job_budgets ──────
async function liveSamples(): Promise<AuditSample[]> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("extraction_cache")
    .select("product_url, source, platform:result->>platform, price:result->product->>price, price_source:result->>price_source")
    .in("result->>platform", STORES)
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`could not read recent quotes: ${error.message}`);
  return ((data ?? []) as Array<Record<string, string | null>>).map((r) => ({
    url: String(r.product_url),
    platform: String(r.platform),
    quotedPrice: r.price != null && r.price !== "" ? Number(r.price) : null,
    quotedSource: r.price_source ?? r.source ?? null,
  }));
}

async function liveDeps(): Promise<AuditDeps> {
  const live = await import("../src/features/extraction/audit/live-tiers");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const production = isProductionDeployment();
  const defaultCap = production ? ACCURACY_AUDIT_JOB.monthlyCaps.production : ACCURACY_AUDIT_JOB.monthlyCaps.other;
  return {
    tiersFor: live.liveTiersFor,
    isPaid: live.liveIsPaid,
    runTier: live.runLiveTier,
    spend: async () => {
      const { data, error } = await db.rpc("increment_job_budget", { p_job: ACCURACY_AUDIT_JOB.jobName, p_period: period(), p_n: 1, p_default_cap: defaultCap });
      if (error) throw new Error(`budget: ${error.message}`);
      const row = data as { used: number; cap: number };
      return row.used <= effectiveMonthlyCap(ACCURACY_AUDIT_JOB.monthlyCaps, row.cap, production);
    },
    log: (l) => console.log(l),
  };
}

(async () => {
  const samples = DRY ? DRY_SAMPLES : await liveSamples();
  const deps = DRY ? dryDeps() : await liveDeps();
  console.log(`${DRY ? "DRY RUN (stub tiers, no spend)" : "LIVE"}: ${samples.length} URL(s), stores ${STORES.join(", ")}\n`);
  const rows = await runAudit(samples, deps);
  console.log(`\n${formatAgreementTable(rows)}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
