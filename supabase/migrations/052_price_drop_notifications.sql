-- Migration 052: price-drop notifications, and the price-watch job becomes a batch.
--
-- WHY. Since 041/042 the nightly job has known about every price drop — it
-- appends the observation that proves it — and nothing has ever told the
-- customer. `price_watches.notify_on_drop` has been stored and honoured by
-- nobody. A watch that notices a drop and stays silent is a worse feature than
-- no watch at all, because the customer believes something is looking.
--
-- Two columns are what make the alert safe to send more than once.
--
-- THE RE-NOTIFICATION PROBLEM. "Email when the price is below where it was" is
-- the obvious rule and it is wrong: a price that drops on Monday and simply
-- stays low emails the customer again on Tuesday, Wednesday and every night
-- afterwards, because it is still below the baseline. The fix is to move the
-- reference point every time we send. `notified_price_usd` records the price
-- the customer was last TOLD about, and the next alert has to beat that, by the
-- threshold, all over again. A price that falls, rises, and settles back at the
-- same level clears no new ground and sends nothing.
--
-- `notified_at` is the audit trail for the same decision: when the last alert
-- for this watch went out, readable next to `last_checked_at` so an admin can
-- tell "we never noticed" apart from "we noticed and said nothing".
--
-- GRANTs are re-stated below even though ADD COLUMN inherits the table's
-- existing privileges. Hosted Supabase configures ALTER DEFAULT PRIVILEGES on
-- `public` and a local `supabase start` stack does not, so every migration here
-- spells its grants out rather than relying on an environment difference — see
-- 036 and 041 for the full note. Being explicit costs nothing and makes the
-- privilege set of this table readable from one file.

-- ── price_watches: what the customer has already been told ────────────────────
ALTER TABLE price_watches ADD COLUMN IF NOT EXISTS notified_at        TIMESTAMPTZ;
ALTER TABLE price_watches ADD COLUMN IF NOT EXISTS notified_price_usd NUMERIC;

COMMENT ON COLUMN price_watches.notified_at IS
  'When a price-drop alert was last sent for this watch. NULL = never notified.';
COMMENT ON COLUMN price_watches.notified_price_usd IS
  'The USD price the last alert quoted. The next alert must beat THIS by the threshold, not the baseline — otherwise a price that stays low re-sends every run.';

GRANT SELECT, INSERT, UPDATE, DELETE ON price_watches TO authenticated;
GRANT ALL ON price_watches TO service_role;

-- ── the threshold, admin-tunable ──────────────────────────────────────────────
-- 3%: below that a "drop" is mostly store price noise (a coupon expiring, a
-- marketplace seller rotating) and the alert trains the customer to ignore the
-- next one. It lives in pricing_constants, not in TypeScript, so moving it is an
-- admin edit rather than a deploy — the same rule every other money figure on
-- the platform follows. The job reads it once per run.
--
-- A missing or out-of-range row (<= 0, or >= 1) means NO alerts are sent and a
-- warning is logged, rather than the job inventing a threshold: 0 would email on
-- every reading that was not an increase.
INSERT INTO pricing_constants (key, value, label, description, unit) VALUES
  ('price_drop_notify_pct', 0.03, 'Price-drop alert threshold',
   'How far a watched product''s USD price must fall below the price the customer was last told about before another alert is sent. 0.03 = 3%.',
   '%')
ON CONFLICT (key) DO NOTHING;

-- pricing_constants (027) already grants authenticated SELECT via RLS policy;
-- re-stated here for the same local/hosted parity reason as above.
GRANT SELECT ON pricing_constants TO authenticated;
GRANT ALL ON pricing_constants TO service_role;

-- ── the job becomes a batch ───────────────────────────────────────────────────
-- 042 scheduled one nightly sweep of up to 200 watches, 4 at a time. Every check
-- is a full extraction with a 25 s vendor budget, so a full 200-watch run is a
-- single Vercel invocation held open for many minutes — past the 300 s function
-- cap, at which point the work is killed mid-sweep and the watches that had not
-- been reached simply wait another day. There is no resume; the next run starts
-- from the same claim query and the same ones lose again.
--
-- So the run shrinks and the schedule grows, the shape `sweep-extractions` and
-- `catalog-scrape` already use: a handful of watches per invocation, finished in
-- well under a minute, fired every 10 minutes. The claim query only returns
-- watches whose last check is older than PRICE_WATCH_JOB.recheckAfterHours, so
-- frequency does NOT multiply scraper spend — once everybody has been checked
-- today the runs claim nothing and return immediately. A killed run costs one
-- batch, and the next one 10 minutes later picks up exactly where it stopped,
-- because `last_checked_at` is stamped per watch and not per sweep.
create extension if not exists pg_net with schema extensions;

create or replace function recheck_price_watches() returns void as $$
declare
  v_app_url text;
  v_cron_secret text;
begin
  -- Vault first, GUC second -- the same order refresh_exchange_rates() uses
  -- since 034. `alter database postgres set app.settings.*` answers 42501 on
  -- hosted Supabase, so a function that reads ONLY the GUC installs cleanly,
  -- warns once a schedule, and never calls the app: a cron that looks healthy
  -- and does nothing.
  select decrypted_secret into v_app_url
  from vault.decrypted_secrets
  where name = 'app_url';

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'cron_secret';

  v_app_url := coalesce(v_app_url, current_setting('app.settings.app_url', true));
  v_cron_secret := coalesce(v_cron_secret, current_setting('app.settings.cron_secret', true));

  if v_app_url is null or v_app_url = '' then
    raise warning 'app_url not configured: set vault secret "app_url" (or app.settings.app_url)';
    return;
  end if;

  perform net.http_get(
    url := v_app_url || '/api/cron/price-watches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
    ),
    -- One batch, not one sweep: 8 extractions 4 at a time is two waves of a
    -- 25 s vendor budget. 300 s matches the route's own maxDuration so pg_net
    -- gives up at the same moment Vercel does, instead of recording a failure
    -- for a run that is still working (042 waited 15 minutes for this reason).
    timeout_milliseconds := 300000
  );
end;
$$ language plpgsql security definer;

select cron.unschedule('recheck-price-watches')
  where exists (select 1 from cron.job where jobname = 'recheck-price-watches');

-- Every 10 minutes, at :03 past — off the exchange-rate refreshes (top of the
-- hour, 026), the catalogue scrape (:05, 045) and the extraction sweep.
select cron.schedule(
  'recheck-price-watches',
  '3,13,23,33,43,53 * * * *',
  $$ select recheck_price_watches(); $$
);
