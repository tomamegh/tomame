import type { HourlyCountInput, ErrorEventInput } from "@/features/ops/alert-rules";
import type { DailySummaryInput } from "@/features/ops/daily-summary";
import type { JobHealth } from "@/features/ops/ops-alerts";

/** Shared by the summary, notify-service and email-render tests. */
export const SUMMARY_NOW = new Date("2026-10-01T07:00:00Z");
export const hoursAgo = (h: number) => new Date(SUMMARY_NOW.getTime() - h * 3600_000).toISOString();

export function fixtureJob(overrides: Partial<JobHealth> = {}): JobHealth {
  return {
    job: "reconcile-payments", label: "Payment reconciliation", route: "/api/cron/reconcile-payments",
    everyMinutes: 5, staleAfterMinutes: 20, migration: "059",
    scheduled: true, active: true, liveSchedule: "*/5 * * * *",
    cronLastStart: hoursAgo(0.05), cronLastStatus: "succeeded",
    appLastRun: hoursAgo(0.05), appLastSuccess: hoursAgo(0.05), lastError: null, lastDurationMs: 800,
    consecutiveFailures: 0, lastSummary: null, stale: false, unreached: false,
    ...overrides,
  };
}

export const FIXTURE_EVENTS: ErrorEventInput[] = [
  { fingerprint: "a", level: "warn", category: "client_4xx", message: "400 from PATCH /api/app/me: Invalid input: expected string, received null", source: "client:4xx PATCH /api/app/me", occurrences: 7, first_seen_at: hoursAgo(20), last_seen_at: hoursAgo(1) },
  { fingerprint: "b", level: "error", category: "server_5xx", message: "Unhandled error in API route: relation \"x\" does not exist", source: "api:/api/cart", occurrences: 3, first_seen_at: hoursAgo(200), last_seen_at: hoursAgo(2) },
  { fingerprint: "c", level: "error", category: "payment", message: "Paystack verification failed", source: null, occurrences: 1, first_seen_at: hoursAgo(5), last_seen_at: hoursAgo(5) },
];

export const FIXTURE_HOURLY: HourlyCountInput[] = [
  { fingerprint: "a", bucket: hoursAgo(1), category: "client_4xx", level: "warn", occurrences: 7 },
  { fingerprint: "b", bucket: hoursAgo(2), category: "server_5xx", level: "error", occurrences: 3 },
  { fingerprint: "c", bucket: hoursAgo(5), category: "payment", level: "error", occurrences: 1 },
  // Outside the window: must not count.
  { fingerprint: "b", bucket: hoursAgo(30), category: "server_5xx", level: "error", occurrences: 50 },
];

export function fixtureSummaryInput(overrides: Partial<DailySummaryInput> = {}): DailySummaryInput {
  return {
    now: SUMMARY_NOW,
    orders: [{ status: "paid" }, { status: "pending" }, { status: "paid" }],
    payments: [{ status: "success", amount: 125_050 }, { status: "success", amount: 20_000 }, { status: "failed", amount: 5_000 }],
    notifications: [
      { channel: "email", status: "sent" },
      { channel: "email", status: "failed" },
      { channel: "whatsapp", status: "sent" },
    ],
    hourly: FIXTURE_HOURLY,
    events: FIXTURE_EVENTS,
    jobs: [fixtureJob(), fixtureJob({ job: "catalog-scrape", label: "Catalogue scrape", stale: true, appLastSuccess: hoursAgo(5) })],
    alerts: [{ key: "job-stale:catalog-scrape", level: "critical", title: "Catalogue scrape is stale", detail: "Last success 5 hours ago; expected every 60 minutes." }],
    warehouseActions: [{ action: "warehouse_item_received" }, { action: "warehouse_item_received" }, { action: "warehouse_package_sealed" }],
    alertEmails24h: 2,
    ...overrides,
  };
}
