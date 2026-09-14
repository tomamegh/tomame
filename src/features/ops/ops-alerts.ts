import type { CronJobSpec } from "@/config/cron";
import type { PaymentTimeouts } from "@/features/payments/services/payment-reconciliation.service";
import type { ErrorHealth } from "@/db/queries/error-events";
import type { CatalogHealth, ExtractionHealth, JobBudgetRow, NotificationsHealth, OrdersHealth, PaymentsHealth } from "@/db/queries/ops";

/**
 * The alarm rules, pure and framework-free so they can be tested with fixtures.
 *
 * Every rule here corresponds to a failure this platform has actually had while
 * looking healthy. Add to this list when the next one is found; do not delete
 * from it because a rule has been quiet.
 */

export type OpsAlertLevel = "critical" | "warning" | "info";

export interface OpsAlert {
  level: OpsAlertLevel;
  /** Short, for the badge row. */
  title: string;
  /** One sentence: what is wrong and what to look at. */
  detail: string;
  href?: string;
}

export interface JobHealth extends CronJobSpec {
  scheduled: boolean;
  active: boolean;
  liveSchedule: string | null;
  cronLastStart: string | null;
  cronLastStatus: string | null;
  appLastRun: string | null;
  appLastSuccess: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  lastSummary: Record<string, unknown> | null;
  stale: boolean;
  unreached: boolean;
}

export interface OpsSnapshot {
  timeouts: PaymentTimeouts;
  jobs: JobHealth[];
  payments: PaymentsHealth | null;
  notifications: NotificationsHealth | null;
  extraction: ExtractionHealth | null;
  orders: OrdersHealth | null;
  budgets: JobBudgetRow[] | null;
  catalog: CatalogHealth | null;
  errors: ErrorHealth | null;
}

/** Minutes between an ISO stamp and `now`. */
export function ageMinutes(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 60_000;
}

export function deriveOpsAlerts(view: OpsSnapshot, now: Date): OpsAlert[] {
  const alerts: OpsAlert[] = [];

  // ── Money ───────────────────────────────────────────────────────────────────
  if (view.payments === null) {
    alerts.push({ level: "critical", title: "Payments unreadable", detail: "The payments panel could not be read. Nothing below about money can be trusted until it can." });
  } else {
    // The reconciliation job releases a pending payment at `expiryMinutes`. One
    // still pending well past that means the job is not running or Paystack is
    // unreachable: exactly the five-day silence this screen exists to end.
    const limit = view.timeouts.expiryMinutes + 15;
    const overdue = view.payments.pending.filter((p) => ageMinutes(p.created_at, now) > limit);
    if (overdue.length > 0) {
      const oldest = Math.max(...overdue.map((p) => ageMinutes(p.created_at, now)));
      alerts.push({
        level: "critical",
        title: `${overdue.length} payment${overdue.length === 1 ? "" : "s"} stuck pending`,
        detail: `The oldest has waited ${describeMinutes(oldest)}, past the ${view.timeouts.expiryMinutes} minute expiry. Either reconcile-payments is not running or Paystack is not answering.`,
        href: "/admin/transactions?status=pending",
      });
    }
    if (view.payments.refundReviews.length > 0) {
      alerts.push({
        level: "critical",
        title: `${view.payments.refundReviews.length} late payment${view.payments.refundReviews.length === 1 ? "" : "s"} need a refund decision`,
        detail: "Money arrived for a payment after its order had been closed for non-payment. Reinstate the order or refund the customer.",
        href: "/admin/transactions",
      });
    }
  }

  // ── Jobs ────────────────────────────────────────────────────────────────────
  for (const job of view.jobs) {
    if (!job.scheduled) {
      alerts.push({ level: "critical", title: `${job.label} is not scheduled`, detail: `pg_cron has no job named ${job.job}. Migration ${job.migration} has not been applied to this database.` });
      continue;
    }
    if (!job.active) {
      alerts.push({ level: "critical", title: `${job.label} is switched off`, detail: `cron.job ${job.job} has active = false.` });
      continue;
    }
    if (job.unreached) {
      alerts.push({
        level: "critical",
        title: `${job.label} is firing but never reaching the app`,
        detail: `pg_cron last ran it ${job.cronLastStart ? describeMinutes(ageMinutes(job.cronLastStart, now)) + " ago" : "recently"} and the app recorded no run. Check the app_url and cron_secret vault secrets and Vercel's function log for ${job.route}.`,
      });
      continue;
    }
    if (job.stale) {
      alerts.push({
        level: job.appLastSuccess === null ? "warning" : "critical",
        title: job.appLastSuccess === null ? `${job.label} has never recorded a run` : `${job.label} is stale`,
        detail:
          job.appLastSuccess === null
            ? `No heartbeat yet. Expected every ${job.everyMinutes} minute${job.everyMinutes === 1 ? "" : "s"}; if this persists past ${job.staleAfterMinutes} minutes after deploy, the route is not being called.`
            : `Last success ${describeMinutes(ageMinutes(job.appLastSuccess, now))} ago; expected every ${job.everyMinutes} minute${job.everyMinutes === 1 ? "" : "s"}.${job.lastError ? ` Last error: ${job.lastError}` : ""}`,
      });
    } else if (job.consecutiveFailures >= 3) {
      alerts.push({ level: "warning", title: `${job.label} failing repeatedly`, detail: `${job.consecutiveFailures} consecutive failures. Last error: ${job.lastError ?? "unknown"}.` });
    }
  }

  // ── Notifications ───────────────────────────────────────────────────────────
  if (view.notifications) {
    const oldest = view.notifications.oldestPendingAt ? ageMinutes(view.notifications.oldestPendingAt, now) : 0;
    if (view.notifications.pending > 0 && oldest > 15) {
      alerts.push({
        level: "warning",
        title: `${view.notifications.pending} notification${view.notifications.pending === 1 ? "" : "s"} pending`,
        detail: `The oldest has waited ${describeMinutes(oldest)}. A notification is written pending and closed by its sender in the same call, so a lingering one means a sender died mid-flight.`,
        href: "/admin/notifications",
      });
    }
    if (view.notifications.failed24h > 0) {
      alerts.push({ level: "warning", title: `${view.notifications.failed24h} email${view.notifications.failed24h === 1 ? "" : "s"} failed today`, detail: "Resend refused or the address was missing. Check RESEND_API_KEY and the failed rows.", href: "/admin/notifications" });
    }
  }

  // ── Extraction ──────────────────────────────────────────────────────────────
  if (view.extraction) {
    if (view.extraction.stuckRunning > 0) {
      alerts.push({ level: "warning", title: `${view.extraction.stuckRunning} paste job${view.extraction.stuckRunning === 1 ? "" : "s"} stuck running`, detail: "Running for over ten minutes. The sweep should reclaim these every minute; if it is healthy, the reclaim rule is not matching them.", href: "/admin/pastes" });
    }
    const total = view.extraction.ready24h + view.extraction.failed24h;
    if (total >= 5 && view.extraction.failed24h / total > 0.3) {
      alerts.push({ level: "warning", title: "Extraction failing often", detail: `${view.extraction.failed24h} of ${total} pastes in the last day failed. Check vendor keys and budgets.`, href: "/admin/pastes" });
    }
  }

  // ── Budgets ─────────────────────────────────────────────────────────────────
  for (const b of view.budgets ?? []) {
    if (b.cap > 0 && b.used / b.cap >= 0.9) {
      alerts.push({ level: b.used >= b.cap ? "critical" : "warning", title: `${b.job} budget ${b.used >= b.cap ? "exhausted" : "nearly spent"}`, detail: `${b.used} of ${b.cap} vendor calls used this period (${b.period}).` });
    }
  }

  // ── Orders ──────────────────────────────────────────────────────────────────
  if (view.orders && view.orders.pendingOver24h > 0) {
    alerts.push({ level: "info", title: `${view.orders.pendingOver24h} order${view.orders.pendingOver24h === 1 ? "" : "s"} unpaid for over a day`, detail: `Their quote locks have lapsed. reconcile-payments closes them after ${view.timeouts.unpaidOrderTtlHours} hours.`, href: "/admin/orders" });
  }

  // ── Errors ──────────────────────────────────────────────────────────────────
  // A new issue is the interesting one: something that has never happened
  // before started happening, which is exactly the signal the platform never
  // had. An old issue still recurring is a warning; a long tail of unresolved
  // ones is a note, not an alarm.
  if (view.errors) {
    if (view.errors.newToday > 0) {
      alerts.push({
        level: "critical",
        title: `${view.errors.newToday} new error${view.errors.newToday === 1 ? "" : "s"} today`,
        detail: "Something that had never failed before started failing in the last day. The list below has the first occurrence and the count.",
        href: "/admin/ops",
      });
    } else if (view.errors.openTotal > 0) {
      alerts.push({
        level: "warning",
        title: `${view.errors.openTotal} open error${view.errors.openTotal === 1 ? "" : "s"}`,
        detail: `${view.errors.occurrences24h} occurrence${view.errors.occurrences24h === 1 ? "" : "s"} recorded in the last day across issues nobody has filed yet.`,
        href: "/admin/ops",
      });
    }
  }

  const rank: Record<OpsAlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** "4 minutes", "3 hours", "5 days" — for prose, never a table cell. */
export function describeMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}
