-- pg_cron run history: seven days kept, and the ops read is one scan (093).
--
-- cron.job_run_details is never purged by pg_cron itself. With two jobs firing
-- every minute it had reached 87k rows by 2026-10-13, and 060's
-- ops_cron_schedule() read it once per job through a LATERAL with no index on
-- jobid: 18 full scans per call. On 2026-10-13 17:52 UTC one call failed and
-- the platform alert emailed "not scheduled" for all ten jobs while every one
-- of them was running (the app now treats a failed read as unknown).
--
-- The health screen only ever wants each job's latest run, so seven days is
-- plenty. Unscheduling first keeps this idempotent.

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-cron-run-details';

SELECT cron.schedule('cleanup-cron-run-details', '40 3 * * *', $$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
$$);

-- Same columns as 060; the latest run per job in one pass instead of one per job.
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
  LEFT JOIN (
    SELECT DISTINCT ON (d.jobid) d.jobid, d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    ORDER BY d.jobid, d.start_time DESC
  ) r ON r.jobid = j.jobid
  ORDER BY j.jobname;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION ops_cron_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ops_cron_schedule() TO service_role;
