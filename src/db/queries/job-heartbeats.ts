import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Mirrors `job_heartbeats` (060). */
export interface JobHeartbeatRow {
  job: string;
  last_run_at: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  last_summary: Record<string, unknown> | null;
  last_duration_ms: number | null;
  consecutive_failures: number;
  updated_at: string;
}

/** One row of `ops_cron_schedule()` (060): pg_cron's view of a job. */
export interface CronScheduleRow {
  jobname: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_status: string | null;
  last_message: string | null;
}

export interface JobRunOutcome {
  ok: boolean;
  ranAt: string;
  durationMs: number;
  summary?: Record<string, unknown>;
  error?: string;
}

/**
 * Upsert the heartbeat for one run. Read-modify-write on `consecutive_failures`
 * is fine here: each job runs on one schedule, so two writers for the same row
 * would already be a bug worth seeing.
 */
export async function recordJobRun(job: string, outcome: JobRunOutcome): Promise<void> {
  const client = createAdminClient();
  const { data: existing } = await client
    .from("job_heartbeats")
    .select("consecutive_failures")
    .eq("job", job)
    .maybeSingle();
  const failures = Number((existing as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0);

  const row: Record<string, unknown> = {
    job,
    last_run_at: outcome.ranAt,
    last_duration_ms: outcome.durationMs,
    last_summary: outcome.summary ?? null,
    consecutive_failures: outcome.ok ? 0 : failures + 1,
    updated_at: outcome.ranAt,
  };
  if (outcome.ok) row.last_success_at = outcome.ranAt;
  else {
    row.last_failure_at = outcome.ranAt;
    row.last_error = outcome.error ?? "unknown";
  }

  const { error } = await client.from("job_heartbeats").upsert(row, { onConflict: "job" });
  if (error) throw new Error(`Failed to record job heartbeat: ${error.message}`);
}

export async function listJobHeartbeats(): Promise<JobHeartbeatRow[]> {
  const client = createAdminClient();
  const { data, error } = await client.from("job_heartbeats").select("*").order("job");
  if (error) throw new Error(`Failed to load job heartbeats: ${error.message}`);
  return (data ?? []) as JobHeartbeatRow[];
}

export async function listCronSchedule(): Promise<CronScheduleRow[]> {
  const client = createAdminClient();
  const { data, error } = await client.rpc("ops_cron_schedule");
  if (error) throw new Error(`Failed to load cron schedule: ${error.message}`);
  return (data ?? []) as CronScheduleRow[];
}
