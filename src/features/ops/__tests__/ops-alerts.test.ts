import { describe, it, expect } from "vitest";

import { deriveOpsAlerts, describeMinutes, type JobHealth, type OpsSnapshot } from "@/features/ops/ops-alerts";

const NOW = new Date("2026-09-14T12:00:00Z");
const iso = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

function job(overrides: Partial<JobHealth> = {}): JobHealth {
  return {
    job: "reconcile-payments", label: "Payment reconciliation", route: "/api/cron/reconcile-payments",
    everyMinutes: 5, staleAfterMinutes: 20, migration: "059",
    scheduled: true, active: true, liveSchedule: "2-59/5 * * * *",
    cronLastStart: iso(3), cronLastStatus: "succeeded",
    appLastRun: iso(3), appLastSuccess: iso(3), lastError: null, lastDurationMs: 800,
    consecutiveFailures: 0, lastSummary: null, stale: false, unreached: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<OpsSnapshot> = {}): OpsSnapshot {
  return {
    timeouts: { expiryMinutes: 60, unpaidOrderTtlHours: 48 },
    jobs: [job()],
    payments: { pending: [], pendingTotal: 0, success24h: 3, failed24h: 0, refundReviews: [], resolved7d: { successful: 3, failed: 0, expired: 0, recovered: 0 } },
    notifications: { pending: 0, oldestPendingAt: null, failed24h: 0, sent24h: 5 },
    extraction: { ready24h: 10, failed24h: 1, pending: 0, stuckRunning: 0 },
    orders: { pending: 1, pendingOver24h: 0 },
    budgets: [{ job: "catalog-scrape", period: "2026-09", used: 10, cap: 500, updated_at: iso(60) }],
    catalog: { products: 100, new24h: 5, lastSeenAt: iso(30) },
    ...overrides,
  };
}

describe("deriveOpsAlerts", () => {
  it("is silent when everything is healthy", () => {
    expect(deriveOpsAlerts(snapshot(), NOW)).toEqual([]);
  });

  it("alarms on a payment pending past the expiry plus a grace, the five-day silence", () => {
    const view = snapshot();
    view.payments!.pending = [{ id: "p1", reference: "TOM_1", amount: 1000, user_id: "u", order_group_id: null, order_id: "o", created_at: iso(5 * 24 * 60) }];
    const alerts = deriveOpsAlerts(view, NOW);
    expect(alerts[0]).toMatchObject({ level: "critical", title: "1 payment stuck pending" });
    expect(alerts[0]!.detail).toContain("5 days");
  });

  it("does not alarm on a pending payment still inside the expiry", () => {
    const view = snapshot();
    view.payments!.pending = [{ id: "p1", reference: "TOM_1", amount: 1000, user_id: "u", order_group_id: null, order_id: "o", created_at: iso(30) }];
    expect(deriveOpsAlerts(view, NOW)).toEqual([]);
  });

  it("treats an unreadable payments panel as critical rather than as zero", () => {
    expect(deriveOpsAlerts(snapshot({ payments: null }), NOW)[0]).toMatchObject({ level: "critical", title: "Payments unreadable" });
  });

  it("flags money that arrived after an order was closed", () => {
    const view = snapshot();
    view.payments!.refundReviews = [{ paymentId: "p", at: iso(10) }];
    expect(deriveOpsAlerts(view, NOW)[0]!.title).toContain("refund decision");
  });

  it("tells pg_cron firing from the app never seeing it", () => {
    const alerts = deriveOpsAlerts(snapshot({ jobs: [job({ unreached: true, appLastRun: null, appLastSuccess: null, stale: true })] }), NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: "critical", title: "Payment reconciliation is firing but never reaching the app" });
  });

  it("reports a job pg_cron does not know about as an unapplied migration", () => {
    const alerts = deriveOpsAlerts(snapshot({ jobs: [job({ scheduled: false })] }), NOW);
    expect(alerts[0]!.detail).toContain("Migration 059");
  });

  it("is only a warning when a job has never run yet, and critical once it has gone quiet", () => {
    expect(deriveOpsAlerts(snapshot({ jobs: [job({ stale: true, appLastSuccess: null, appLastRun: null, cronLastStart: null })] }), NOW)[0]!.level).toBe("warning");
    expect(deriveOpsAlerts(snapshot({ jobs: [job({ stale: true, appLastSuccess: iso(90), cronLastStart: null })] }), NOW)[0]!.level).toBe("critical");
  });

  it("warns on lingering and failed notifications, and on a nearly spent budget", () => {
    const view = snapshot({
      notifications: { pending: 2, oldestPendingAt: iso(40), failed24h: 1, sent24h: 0 },
      budgets: [{ job: "catalog-scrape", period: "2026-09", used: 460, cap: 500, updated_at: iso(1) }],
    });
    const titles = deriveOpsAlerts(view, NOW).map((a) => a.title);
    expect(titles).toContain("2 notifications pending");
    expect(titles).toContain("1 email failed today");
    expect(titles).toContain("catalog-scrape budget nearly spent");
  });

  it("orders critical before warning before info", () => {
    const view = snapshot({ orders: { pending: 3, pendingOver24h: 2 }, jobs: [job({ scheduled: false })], notifications: { pending: 1, oldestPendingAt: iso(30), failed24h: 0, sent24h: 0 } });
    expect(deriveOpsAlerts(view, NOW).map((a) => a.level)).toEqual(["critical", "warning", "info"]);
  });
});

describe("describeMinutes", () => {
  it("picks the unit a person would", () => {
    expect(describeMinutes(1)).toBe("1 minute");
    expect(describeMinutes(45)).toBe("45 minutes");
    expect(describeMinutes(150)).toBe("3 hours");
    expect(describeMinutes(5 * 24 * 60)).toBe("5 days");
  });
});
