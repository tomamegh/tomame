/**
 * The scheduled jobs, as data.
 *
 * `everyMinutes` is what pg_cron is told (see the migration named on each row);
 * the operations screen alarms when a job's last successful heartbeat is older
 * than `staleAfterMinutes`. Keep this in step with `cron.job` in the migrations;
 * `ops_cron_schedule()` (060) shows the live schedule beside it so drift is
 * visible rather than silent.
 */
export interface CronJobSpec {
  job: string;
  label: string;
  route: string;
  everyMinutes: number;
  /** Generous: a job may legitimately skip a run (a vendor timeout, a deploy). */
  staleAfterMinutes: number;
  migration: string;
}

export const CRON_JOBS: readonly CronJobSpec[] = [
  { job: "sweep-extractions", label: "Paste queue sweep", route: "/api/cron/sweep-extractions", everyMinutes: 1, staleAfterMinutes: 10, migration: "049" },
  { job: "reconcile-payments", label: "Payment reconciliation", route: "/api/cron/reconcile-payments", everyMinutes: 5, staleAfterMinutes: 20, migration: "059" },
  { job: "recheck-price-watches", label: "Price watch re-check", route: "/api/cron/price-watches", everyMinutes: 10, staleAfterMinutes: 40, migration: "052" },
  { job: "catalog-scrape", label: "Catalogue scrape", route: "/api/cron/catalog-scrape", everyMinutes: 60, staleAfterMinutes: 150, migration: "045" },
  { job: "fetch-exchange-rates", label: "Exchange rates", route: "/api/cron/exchange-rates", everyMinutes: 240, staleAfterMinutes: 540, migration: "026" },
] as const;

/** pg_cron job name → the heartbeat name the route records. They are the same string on purpose. */
export function cronJobSpec(job: string): CronJobSpec | null {
  return CRON_JOBS.find((j) => j.job === job) ?? null;
}
