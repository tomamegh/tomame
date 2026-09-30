import { describe, expect, it } from "vitest";

import { accraDate, buildDailySummary, dailySummarySubject } from "@/features/ops/daily-summary";
import { fixtureSummaryInput, SUMMARY_NOW } from "./fixtures";

describe("buildDailySummary", () => {
  const s = buildDailySummary(fixtureSummaryInput());

  it("counts orders and money, pesewas turned into cedis", () => {
    expect(s.orders).toEqual({ created: 3, byStatus: { paid: 2, pending: 1 } });
    expect(s.payments).toEqual({ success: 2, failed: 1, pending: 0, successGhs: 1450.5 });
  });

  it("splits errors into 5xx, payment, job and browser-reported 4xx, inside the window only", () => {
    expect(s.errors).toMatchObject({ serverErrors: 3, paymentErrors: 1, jobErrors: 0, clientRejections: 7, clientCrashes: 0 });
  });

  it("ranks the top issues by count and marks the new ones", () => {
    expect(s.errors.top.map((t) => [t.fingerprint, t.count, t.isNew])).toEqual([
      ["a", 7, true],
      ["b", 3, false],
      ["c", 1, true],
    ]);
    expect(s.errors.newIssues).toBe(2);
  });

  it("reports jobs, notifications and warehouse throughput", () => {
    expect(s.jobs).toEqual({ total: 2, healthy: 1, stale: ["Catalogue scrape"], failing: [] });
    expect(s.notifications).toEqual({ email: { sent: 1, failed: 1, pending: 0 }, whatsapp: { sent: 1, failed: 0, pending: 0 } });
    expect(s.warehouse).toEqual({ total: 3, byAction: { item_received: 2, package_sealed: 1 } });
  });

  it("is critical when the Health screen has a critical alarm", () => {
    expect(s.status).toBe("critical");
    expect(s.attention).toHaveLength(1);
    expect(dailySummarySubject(s, "dev")).toBe("[Tomame dev] Daily health, 2026-10-01: 1 to look at (1 critical)");
  });

  it("is healthy on a quiet day", () => {
    const quiet = buildDailySummary(fixtureSummaryInput({ alerts: [], hourly: [], events: [] }));
    expect(quiet.status).toBe("healthy");
    expect(dailySummarySubject(quiet, null)).toBe("[Tomame] Daily health, 2026-10-01: all healthy");
  });

  it("says when warehouse activity could not be read instead of reporting zero", () => {
    expect(buildDailySummary(fixtureSummaryInput({ warehouseActions: null })).warehouse).toBeNull();
  });

  it("dates the summary in Accra, which is UTC", () => {
    expect(accraDate(SUMMARY_NOW)).toBe("2026-10-01");
  });
});
