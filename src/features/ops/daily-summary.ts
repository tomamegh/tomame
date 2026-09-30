import type { HourlyCountInput, ErrorEventInput } from "./alert-rules";
import type { JobHealth, OpsAlert } from "./ops-alerts";

/**
 * The 07:00 health summary, as data. Pure: the service gathers the rows, this
 * counts them, the email template and the /admin/ops panel both render it.
 */

export interface DailySummaryInput {
  now: Date;
  orders: { status: string }[];
  payments: { status: string; amount: number }[];
  notifications: { channel: string; status: string }[];
  hourly: HourlyCountInput[];
  /** The issues behind the hourly rows, for their wording. */
  events: ErrorEventInput[];
  jobs: JobHealth[];
  alerts: OpsAlert[];
  warehouseActions: { action: string }[] | null;
  alertEmails24h: number;
}

export interface TopIssue {
  fingerprint: string;
  category: string;
  message: string;
  source: string | null;
  count: number;
  isNew: boolean;
}

export type ChannelCounts = { sent: number; failed: number; pending: number };

export interface DailySummary {
  /** The Accra calendar date the summary is for (the day ending now). */
  date: string;
  windowStart: string;
  windowEnd: string;
  status: "healthy" | "attention" | "critical";
  orders: { created: number; byStatus: Record<string, number> };
  payments: { success: number; failed: number; pending: number; successGhs: number };
  errors: {
    serverErrors: number;
    paymentErrors: number;
    jobErrors: number;
    clientRejections: number;
    clientCrashes: number;
    newIssues: number;
    top: TopIssue[];
  };
  jobs: { total: number; healthy: number; stale: string[]; failing: string[] };
  notifications: { email: ChannelCounts; whatsapp: ChannelCounts };
  warehouse: { total: number; byAction: Record<string, number> } | null;
  attention: { level: string; title: string; detail: string; href?: string }[];
  alertEmails24h: number;
}

const TOP_ISSUES = 5;

/** Accra is GMT all year, so its date is the UTC date. Named so nobody "fixes" it. */
export function accraDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function buildDailySummary(input: DailySummaryInput): DailySummary {
  const { now } = input;
  const windowStart = new Date(now.getTime() - 24 * 3600_000);

  const byStatus: Record<string, number> = {};
  for (const o of input.orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

  let success = 0;
  let failed = 0;
  let pending = 0;
  let successPesewas = 0;
  for (const p of input.payments) {
    if (p.status === "success") {
      success += 1;
      successPesewas += Number.isFinite(p.amount) ? p.amount : 0;
    } else if (p.status === "failed") failed += 1;
    else if (p.status === "pending") pending += 1;
  }

  // Hourly rows inside the window only. The window is 24 whole hours back from
  // the current bucket, which is what "yesterday" means at 07:00.
  const from = windowStart.getTime();
  const counts: Record<string, number> = {};
  const n = (category: string) => counts[category] ?? 0;
  const perFingerprint = new Map<string, { count: number; category: string }>();
  for (const r of input.hourly) {
    if (new Date(r.bucket).getTime() < from - 3600_000) continue;
    if (r.level === "error" || r.category === "client_4xx") counts[r.category] = (counts[r.category] ?? 0) + r.occurrences;
    const prev = perFingerprint.get(r.fingerprint);
    perFingerprint.set(r.fingerprint, { count: (prev?.count ?? 0) + r.occurrences, category: r.category });
  }

  const eventsByFp = new Map(input.events.map((e) => [e.fingerprint, e]));
  const windowIso = windowStart.toISOString();
  const top: TopIssue[] = [...perFingerprint.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_ISSUES)
    .map(([fingerprint, v]) => {
      const e = eventsByFp.get(fingerprint);
      return {
        fingerprint,
        category: v.category,
        message: (e?.message ?? "(issue since resolved and cleaned up)").slice(0, 200),
        source: e?.source ?? null,
        count: v.count,
        isNew: e ? e.first_seen_at >= windowIso : false,
      };
    });
  const newIssues = input.events.filter((e) => e.first_seen_at >= windowIso).length;

  const channel = (name: string): ChannelCounts => {
    const rows = input.notifications.filter((n) => n.channel === name);
    return {
      sent: rows.filter((n) => n.status === "sent").length,
      failed: rows.filter((n) => n.status === "failed").length,
      pending: rows.filter((n) => n.status === "pending").length,
    };
  };

  let warehouse: DailySummary["warehouse"] = null;
  if (input.warehouseActions) {
    const byAction: Record<string, number> = {};
    for (const a of input.warehouseActions) {
      const label = a.action.replace(/^warehouse_/, "");
      byAction[label] = (byAction[label] ?? 0) + 1;
    }
    warehouse = { total: input.warehouseActions.length, byAction };
  }

  const stale = input.jobs.filter((j) => j.scheduled && j.stale && j.appLastSuccess !== null).map((j) => j.label);
  const failing = input.jobs.filter((j) => j.consecutiveFailures > 0 || j.unreached || !j.scheduled).map((j) => j.label);
  const unhealthy = new Set([...stale, ...failing]);

  const attention = input.alerts
    .filter((a) => a.level !== "info" || a.key === "orders-unpaid")
    .map((a) => ({ level: a.level, title: a.title, detail: a.detail, href: a.href }));

  const critical = input.alerts.some((a) => a.level === "critical");
  const status: DailySummary["status"] = critical ? "critical" : attention.length > 0 ? "attention" : "healthy";

  return {
    date: accraDate(now),
    windowStart: windowIso,
    windowEnd: now.toISOString(),
    status,
    orders: { created: input.orders.length, byStatus },
    payments: { success, failed, pending, successGhs: Math.round(successPesewas) / 100 },
    errors: {
      serverErrors: n("server_5xx") + n("server") + n("notification"),
      paymentErrors: n("payment"),
      jobErrors: n("job"),
      clientRejections: n("client_4xx"),
      clientCrashes: n("client_crash"),
      newIssues,
      top,
    },
    jobs: { total: input.jobs.length, healthy: input.jobs.length - unhealthy.size, stale, failing },
    notifications: { email: channel("email"), whatsapp: channel("whatsapp") },
    warehouse,
    attention,
    alertEmails24h: input.alertEmails24h,
  };
}

export function dailySummarySubject(summary: DailySummary, envLabel: string | null): string {
  const prefix = envLabel ? `[Tomame ${envLabel}]` : "[Tomame]";
  const critical = summary.attention.filter((a) => a.level === "critical").length;
  const state =
    summary.status === "healthy"
      ? "all healthy"
      : `${summary.attention.length} to look at${critical ? ` (${critical} critical)` : ""}`;
  return `${prefix} Daily health, ${summary.date}: ${state}`;
}
