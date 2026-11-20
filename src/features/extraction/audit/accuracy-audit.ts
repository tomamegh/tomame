import { pricesAgree } from "../price-confidence";

/**
 * Extraction accuracy audit (plan A0c), the pure half: run every tier over a
 * sample of URLs, then say per tier how often it agreed with the consensus.
 * The tier runner and the budget are injected, so the same code is driven by
 * stubs in tests and `--dry-run`, and by the real resolver chain in
 * `scripts/extraction-accuracy-audit.ts`.
 */

export interface AuditSample {
  url: string;
  /** Store slug. */
  platform: string;
  /** What the quote said when it was cached, and which tier said it. */
  quotedPrice: number | null;
  quotedSource: string | null;
}

export interface TierReading {
  tier: string;
  price: number | null;
  currency: string | null;
  ms: number;
  error?: string;
}

export interface AuditDeps {
  /** Tiers to try for a store, cheapest first. */
  tiersFor(platform: string): string[];
  /** Tiers that spend a vendor call (metered against the budget). */
  isPaid(tier: string): boolean;
  /** One tier on one URL. Never throws. */
  runTier(sample: AuditSample, tier: string): Promise<TierReading>;
  /** Spend one unit of the monthly budget; false when it is used up. */
  spend(): Promise<boolean>;
  log?(line: string): void;
}

export interface AuditRow {
  sample: AuditSample;
  readings: TierReading[];
  /** The price most tiers agreed on (within 2%), or null when nobody agreed. */
  consensus: number | null;
  /** The budget ran out before every tier ran. */
  budgetCut: boolean;
}

/** The price the largest group of readings agrees on; ties prefer the group holding the cached quote. */
export function consensusPrice(prices: readonly number[], quoted: number | null = null): number | null {
  const ps = prices.filter((p) => p > 0);
  let best: { price: number; size: number; hasQuote: boolean } | null = null;
  for (const p of ps) {
    const group = ps.filter((q) => pricesAgree(p, q));
    const hasQuote = quoted != null && pricesAgree(p, quoted);
    if (!best || group.length > best.size || (group.length === best.size && hasQuote && !best.hasQuote)) best = { price: p, size: group.length, hasQuote };
  }
  return best && best.size >= 2 ? best.price : null;
}

export async function runAudit(samples: readonly AuditSample[], deps: AuditDeps): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  let exhausted = false;
  for (const sample of samples) {
    const readings: TierReading[] = [];
    let budgetCut = false;
    for (const tier of deps.tiersFor(sample.platform)) {
      if (deps.isPaid(tier)) {
        if (exhausted || !(await deps.spend())) {
          exhausted = true;
          budgetCut = true;
          continue;
        }
      }
      readings.push(await deps.runTier(sample, tier));
    }
    const priced = readings.map((r) => r.price).filter((p): p is number => p != null);
    rows.push({ sample, readings, consensus: consensusPrice(priced, sample.quotedPrice), budgetCut });
    deps.log?.(`${sample.platform.padEnd(9)} ${readings.map((r) => `${r.tier}=${r.price ?? "-"}`).join(" ")}  ${sample.url}`);
  }
  return rows;
}

export interface TierStats {
  tier: string;
  ran: number;
  priced: number;
  agreed: number;
  disagreed: number;
  /** Readings with no consensus to judge against. */
  undecided: number;
  medianMs: number | null;
}

export function tierAgreement(rows: readonly AuditRow[]): TierStats[] {
  const stats = new Map<string, TierStats & { times: number[] }>();
  for (const row of rows) {
    for (const r of row.readings) {
      const s = stats.get(r.tier) ?? { tier: r.tier, ran: 0, priced: 0, agreed: 0, disagreed: 0, undecided: 0, medianMs: null, times: [] };
      s.ran += 1;
      s.times.push(r.ms);
      if (r.price != null) {
        s.priced += 1;
        if (row.consensus == null) s.undecided += 1;
        else if (pricesAgree(r.price, row.consensus)) s.agreed += 1;
        else s.disagreed += 1;
      }
      stats.set(r.tier, s);
    }
  }
  return [...stats.values()].map(({ times, ...s }) => {
    const sorted = [...times].sort((a, b) => a - b);
    return { ...s, medianMs: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null };
  });
}

/** The cached quote against the consensus: how often what customers saw was right. */
export function quoteAccuracy(rows: readonly AuditRow[]): { judged: number; right: number; wrong: Array<{ url: string; quoted: number; consensus: number; source: string | null }> } {
  const wrong: Array<{ url: string; quoted: number; consensus: number; source: string | null }> = [];
  let judged = 0;
  for (const row of rows) {
    const quoted = row.sample.quotedPrice;
    if (quoted == null || row.consensus == null) continue;
    judged += 1;
    if (!pricesAgree(quoted, row.consensus)) wrong.push({ url: row.sample.url, quoted, consensus: row.consensus, source: row.sample.quotedSource });
  }
  return { judged, right: judged - wrong.length, wrong };
}

const pad = (v: unknown, n: number) => String(v ?? "").padEnd(n).slice(0, n);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

export function formatAgreementTable(rows: readonly AuditRow[]): string {
  const lines = [
    `${pad("tier", 16)}${pad("ran", 6)}${pad("priced", 8)}${pad("agree", 8)}${pad("disagree", 10)}${pad("no consensus", 14)}${pad("agree %", 9)}median ms`,
  ];
  for (const s of tierAgreement(rows)) {
    lines.push(`${pad(s.tier, 16)}${pad(s.ran, 6)}${pad(s.priced, 8)}${pad(s.agreed, 8)}${pad(s.disagreed, 10)}${pad(s.undecided, 14)}${pad(pct(s.agreed, s.agreed + s.disagreed), 9)}${s.medianMs ?? "-"}`);
  }
  const acc = quoteAccuracy(rows);
  lines.push("", `Cached quotes vs consensus: ${acc.right}/${acc.judged} right (${pct(acc.right, acc.judged)}).`);
  for (const w of acc.wrong.slice(0, 20)) lines.push(`  WRONG ${w.quoted} vs ${w.consensus} (${w.source ?? "?"}) ${w.url}`);
  const cut = rows.filter((r) => r.budgetCut).length;
  if (cut) lines.push(`Budget ran out: ${cut} URL(s) missed paid tiers.`);
  return lines.join("\n");
}
