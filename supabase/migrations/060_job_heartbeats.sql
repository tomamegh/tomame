-- Migration 060: job heartbeats — detection of ABSENCE.
--
-- WHY. Every silent failure this platform has had was a thing working "fine"
-- while doing nothing: payments that never settled (059), a notification log
-- that rendered empty from the day it shipped, a cron that could stop reaching
-- the app with nobody noticing. pg_cron's own `job_run_details` only says the
-- SQL ran; `net.http_get` is fire-and-forget, so a job that "succeeded" every
-- minute may never have reached a route. The app is the only party that knows
-- whether it actually ran, so the app writes the heartbeat.
--
-- One row per job, upserted by `runCronJob` (src/lib/auth/cron.ts) on every
-- run. The operations screen reads it next to pg_cron's schedule and alarms
-- when the two disagree, or when either goes quiet.
CREATE TABLE IF NOT EXISTS job_heartbeats (
  job                  TEXT PRIMARY KEY,
  last_run_at          TIMESTAMPTZ NOT NULL,
  last_success_at      TIMESTAMPTZ,
  last_failure_at      TIMESTAMPTZ,
  last_error           TEXT,
  last_summary         JSONB,
  last_duration_ms     INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE job_heartbeats IS
  'One row per cron job, written by the app on every run. The operations screen alarms on staleness.';

ALTER TABLE job_heartbeats ENABLE ROW LEVEL SECURITY;
-- Server-only. No client role can read or write it; the admin screen reads it
-- through the service role behind an admin check.
GRANT ALL ON job_heartbeats TO service_role;

-- ── pg_cron's side of the story, readable from the app ────────────────────────
-- The `cron` schema is not exposed over PostgREST. This SECURITY DEFINER
-- function hands the app what it needs: each job's schedule and its last run as
-- pg_cron saw it. Granted to service_role ONLY; a customer must not learn the
-- job list.
CREATE OR REPLACE FUNCTION ops_cron_schedule()
RETURNS TABLE (
  jobname       TEXT,
  schedule      TEXT,
  active        BOOLEAN,
  last_start    TIMESTAMPTZ,
  last_status   TEXT,
  last_message  TEXT
) AS $$
  SELECT j.jobname::text,
         j.schedule::text,
         j.active,
         r.start_time,
         r.status::text,
         r.return_message::text
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, status, return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY start_time DESC
    LIMIT 1
  ) r ON true
  ORDER BY j.jobname;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION ops_cron_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ops_cron_schedule() TO service_role;
