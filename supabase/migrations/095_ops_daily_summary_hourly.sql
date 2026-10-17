-- Migration 095: the daily health email is called every hour, not four times at 07:00.
--
-- WHY. 083 fired `ops-daily-summary` only within 07:00 UTC. On 2026-10-16 the
-- prod database was down through that hour, so no run reached the app, and
-- the "Daily health email is stale" alert then fired every hour until the next
-- morning (it is a 24-hour job, so nothing could clear it sooner). Called
-- hourly, the route answers "not due yet" before 07:00, sends on the first
-- healthy call from 07:00 (the per-date claim in ops_alert_sends still stops a
-- second send), and answers "already sent" after. A lost morning goes out an
-- hour later, and src/config/cron.ts now alarms after 3 hours, not 26.

SELECT cron.unschedule('ops-daily-summary')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops-daily-summary');
-- :04 keeps clear of reconcile-payments (:00) and ops-alerts (:02, :07, ...).
SELECT cron.schedule('ops-daily-summary', '4 * * * *', $$ SELECT run_ops_daily_summary(); $$);
