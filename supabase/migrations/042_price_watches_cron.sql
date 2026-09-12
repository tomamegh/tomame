-- Migration 042: nightly price-watch re-check schedule.
--
-- Migration 041 created price_watches and price_observations but nothing writes
-- to the series after the first observation. Every figure the price-watch card
-- shows — the 7-day delta, "lowest in 30 days", the sparkline — is derived from
-- price_observations, so without a recurring writer the card renders one dot
-- forever and the feature is decorative.
--
-- WHY pg_cron AND NOT A QUEUE. The platform already refreshes exchange rates
-- this way (migration 026): pg_cron fires, pg_net makes one authenticated GET,
-- and the Next.js route does the work where the extraction chain, the pricing
-- engine and the scraper credentials already live. Adding a second scheduling
-- mechanism for one job a day would be a new thing to operate for no gain. The
-- route caps and paces itself (config/security.ts → PRICE_WATCH_JOB: 200
-- watches per run, 4 at a time), so this schedule only has to say "once a day".
--
-- WHY 06:00 UTC. That is 6am in Accra (Ghana is UTC+0 year-round) — after US
-- stores have settled the previous day's prices and before the morning the
-- customer opens the app, so the Home card is fresh when it is read. It is also
-- two hours off the exchange-rate refreshes (0,4,8,… UTC) so the two jobs do not
-- contend for the same pg_net worker.
--
-- Setup required (run once in the Supabase SQL editor for production — the same
-- two settings migration 026 uses; nothing new to provision):
--   alter database postgres set app.settings.app_url = 'https://your-app.vercel.app';
--   alter database postgres set app.settings.cron_secret = 'your-cron-secret';

create extension if not exists pg_net with schema extensions;

-- ── the caller ────────────────────────────────────────────────────────────────
-- Mirrors refresh_exchange_rates(): security definer so the cron owner can read
-- the database-level settings, and a warning-and-return (not an exception) when
-- app_url is unset, because a misconfigured environment should leave a log line
-- rather than a failed cron entry that hides every later run.
create or replace function recheck_price_watches() returns void as $$
declare
  v_app_url text;
  v_cron_secret text;
begin
  v_app_url := current_setting('app.settings.app_url', true);
  v_cron_secret := current_setting('app.settings.cron_secret', true);

  if v_app_url is null or v_app_url = '' then
    raise warning 'app.settings.app_url not configured';
    return;
  end if;

  perform net.http_get(
    url := v_app_url || '/api/cron/price-watches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
    ),
    -- A run re-extracts up to 200 products, 4 at a time. pg_net's default
    -- timeout would abandon the request long before the route answers; the work
    -- would still complete, but the summary would be lost and the run would look
    -- like a failure. 15 minutes is comfortably past the worst realistic run.
    timeout_milliseconds := 900000
  );
end;
$$ language plpgsql security definer;

-- ── the schedule ──────────────────────────────────────────────────────────────
-- Unscheduled first so re-running this migration (or a `db reset`) does not fail
-- on the duplicate job name — cron.schedule raises on a name it already holds.
select cron.unschedule('recheck-price-watches')
  where exists (select 1 from cron.job where jobname = 'recheck-price-watches');

-- Daily at 06:00 UTC.
select cron.schedule(
  'recheck-price-watches',
  '0 6 * * *',
  $$ select recheck_price_watches(); $$
);
