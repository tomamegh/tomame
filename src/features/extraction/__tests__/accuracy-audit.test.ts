import { describe, it, expect, vi } from "vitest";
import { consensusPrice, formatAgreementTable, quoteAccuracy, runAudit, tierAgreement, type AuditDeps, type AuditSample } from "../audit/accuracy-audit";

const sample = (url: string, quotedPrice: number | null): AuditSample => ({ url, platform: "amazon", quotedPrice, quotedSource: "scraperapi" });

function deps(prices: Record<string, Record<string, number | null>>, cap: number): AuditDeps & { spent: () => number } {
  let used = 0;
  return {
    tiersFor: () => ["scraperapi", "zyte", "structured-data"],
    isPaid: (t) => t !== "structured-data",
    runTier: vi.fn(async (s: AuditSample, tier: string) => ({ tier, price: prices[s.url]?.[tier] ?? null, currency: "USD", ms: 1 })),
    spend: async () => ++used <= cap,
    spent: () => used,
  };
}

describe("accuracy audit (A0c)", () => {
  it("consensus is the largest group within 2%, and needs two readings", () => {
    expect(consensusPrice([10, 10.1, 30])).toBe(10);
    expect(consensusPrice([10, 30])).toBeNull();
    expect(consensusPrice([10, 10, 30, 30], 30)).toBe(30);
  });

  it("scores every tier against the consensus and the cached quote", async () => {
    const d = deps({ a: { scraperapi: 20, zyte: 20.2, "structured-data": 25 }, b: { scraperapi: 9, zyte: 9, "structured-data": null } }, 10);
    const rows = await runAudit([sample("a", 20), sample("b", 90)], d);
    const byTier = Object.fromEntries(tierAgreement(rows).map((s) => [s.tier, s]));
    expect(byTier.scraperapi).toMatchObject({ ran: 2, priced: 2, agreed: 2, disagreed: 0 });
    expect(byTier["structured-data"]).toMatchObject({ priced: 1, disagreed: 1 });
    expect(quoteAccuracy(rows)).toMatchObject({ judged: 2, right: 1, wrong: [{ url: "b", quoted: 90, consensus: 9 }] });
    expect(formatAgreementTable(rows)).toContain("Cached quotes vs consensus: 1/2 right (50%).");
  });

  it("stops paying when the budget runs out, but still runs the free parser", async () => {
    const d = deps({}, 2);
    const rows = await runAudit([sample("a", 1), sample("b", 1)], d);
    expect(rows[0]!.readings.map((r) => r.tier)).toEqual(["scraperapi", "zyte", "structured-data"]);
    expect(rows[1]!.readings.map((r) => r.tier)).toEqual(["structured-data"]);
    expect(rows[1]!.budgetCut).toBe(true);
    expect(d.spent()).toBe(3);
  });
});
