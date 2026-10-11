-- Exchange rates four times a day (092).
--
-- 026 refreshed rates every 4 hours, and each refresh made one provider
-- request per currency (six). With dev and prod sharing the one
-- exchangerate-api.com key (1,500 requests a month), the allowance ran out
-- around the middle of every cycle and quotes then priced at a stale rate.
-- The app now makes one request per refresh; this moves the refresh to every
-- 6 hours, so the two deployments together use about 240 a month.
--
-- Same function, same route; only the schedule changes. Unscheduling first
-- keeps this idempotent on a database where the job was renamed or removed.

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fetch-exchange-rates';

-- 00:00, 06:00, 12:00, 18:00 UTC
SELECT cron.schedule(
  'fetch-exchange-rates',
  '0 0,6,12,18 * * *',
  $$ select refresh_exchange_rates(); $$
);
