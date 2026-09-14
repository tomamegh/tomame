import "server-only";

import { CRON_JOBS, type CronJobSpec } from "@/config/cron";
import { listCronSchedule, listJobHeartbeats, type CronScheduleRow, type JobHeartbeatRow } from "@/db/queries/job-heartbeats";
import { readErrorHealth, type ErrorHealth } from "@/db/queries/error-events";
import {
  listJobBudgets,
  readCatalogHealth,
  readExtractionHealth,
  readNotificationsHealth,
  readOrdersHealth,
  readPaymentsHealth,
  type CatalogHealth,
  type ExtractionHealth,
  type JobBudgetRow,
  type NotificationsHealth,
  type OrdersHealth,
  type PaymentsHealth,
} from "@/db/queries/ops";
import { resolvePaymentTimeouts, type PaymentTimeouts } from "@/features/payments/services/payment-reconciliation.service";
import { logger } from "@/lib/logger";
import { deriveOpsAlerts, type JobHealth, type OpsAlert } from "./ops-alerts";

export type { JobHealth, OpsAlert, OpsAlertLevel } from "./ops-alerts";

/**
 * The operations overview: "what must never again go unnoticed for five days".
 *
 * Detection is about ABSENCE as much as errors: a cron that stops running, a
 * queue that stops draining, a payment that never resolves, a notification
 * that stays pending. Every panel here is already in the database; this is the
 * first screen that reads them together and says which ones are wrong.
 *
 * FAILURE POLICY, same as the dashboard: each read is degraded on its own, so a
 * broken panel reads "unavailable" instead of taking the health screen down,
 * which would be the one screen an operator needs while things are broken.
 */
export interface OpsOverview {
  generatedAt: string;
  timeouts: PaymentTimeouts;
  alerts: OpsAlert[];
  jobs: JobHealth[];
  payments: PaymentsHealth | null;
  notifications: NotificationsHealth | null;
  extraction: ExtractionHealth | null;
  orders: OrdersHealth | null;
  budgets: JobBudgetRow[] | null;
  catalog: CatalogHealth | null;
  errors: ErrorHealth | null;
}

export async function getOpsOverview(now: Date = new Date()): Promise<OpsOverview> {
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const [timeouts, heartbeats, schedule, payments, notifications, extraction, orders, budgets, catalog, errors] = await Promise.all([
    degrade(resolvePaymentTimeouts(), { expiryMinutes: 60, unpaidOrderTtlHours: 48 }, "timeouts"),
    degrade(listJobHeartbeats(), null, "heartbeats"),
    degrade(listCronSchedule(), null, "cron schedule"),
    degrade(readPaymentsHealth(now), null, "payments"),
    degrade(readNotificationsHealth(now), null, "notifications"),
    degrade(readExtractionHealth(now), null, "extraction"),
    degrade(readOrdersHealth(now), null, "orders"),
    degrade(listJobBudgets(period), null, "budgets"),
    degrade(readCatalogHealth(now), null, "catalogue"),
    degrade(readErrorHealth(now), null, "errors"),
  ]);

  const jobs = mergeJobs(CRON_JOBS, heartbeats ?? [], schedule ?? [], now);
  const view: OpsOverview = {
    generatedAt: now.toISOString(),
    timeouts,
    alerts: [],
    jobs,
    payments,
    notifications,
    extraction,
    orders,
    budgets,
    catalog,
    errors,
  };
  view.alerts = deriveOpsAlerts(view, now);
  return view;
}

/** One line per registered job: what pg_cron says next to what the app recorded. */
export function mergeJobs(
  specs: readonly CronJobSpec[],
  heartbeats: JobHeartbeatRow[],
  schedule: CronScheduleRow[],
  now: Date,
): JobHealth[] {
  return specs.map((spec) => {
    const hb = heartbeats.find((h) => h.job === spec.job) ?? null;
    const cron = schedule.find((s) => s.jobname === spec.job) ?? null;
    const lastSuccess = hb?.last_success_at ?? null;
    const minutesSinceSuccess = lastSuccess ? (now.getTime() - new Date(lastSuccess).getTime()) / 60_000 : null;
    const minutesSinceCron = cron?.last_start ? (now.getTime() - new Date(cron.last_start).getTime()) / 60_000 : null;
    return {
      ...spec,
      scheduled: cron !== null,
      active: cron?.active ?? false,
      liveSchedule: cron?.schedule ?? null,
      cronLastStart: cron?.last_start ?? null,
      cronLastStatus: cron?.last_status ?? null,
      appLastRun: hb?.last_run_at ?? null,
      appLastSuccess: lastSuccess,
      lastError: hb?.last_error ?? null,
      lastDurationMs: hb?.last_duration_ms ?? null,
      consecutiveFailures: hb?.consecutive_failures ?? 0,
      lastSummary: hb?.last_summary ?? null,
      stale: minutesSinceSuccess === null || minutesSinceSuccess > spec.staleAfterMinutes,
      /** pg_cron fired recently and the app never saw it: pg_net is not reaching the app. */
      unreached:
        minutesSinceCron !== null &&
        minutesSinceCron <= spec.staleAfterMinutes &&
        (hb === null || now.getTime() - new Date(hb.last_run_at).getTime() > spec.staleAfterMinutes * 60_000),
    };
  });
}

async function degrade<T>(work: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    logger.warn(`ops overview: ${label} failed`, { error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}
