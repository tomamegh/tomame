-- Migration 083: errors that email someone, and a morning health summary.
--
-- WHY. 062 gave the platform one place errors land (`error_events`) and 060
-- told it when a job stopped running, but both only speak when an admin opens
-- /admin/ops. A customer hit "Invalid input: expected string, received null"
-- on the profile screen (2026-09-30) and nobody knew until they said so. This
-- migration adds what the app needs to tell a person without being asked:
--
--   1. `error_events.category`, so a 5xx, a customer's rejected form, a
--      crashed screen, a failed job and a payment fault can be told apart.
--   2. `error_event_hourly`, per-fingerprint counts per hour. `error_events`
--      keeps one running total per issue, which cannot answer "how many in the
--      last hour" or "is this a spike"; this can, and it is what the daily
--      summary's 4xx and 5xx counts come from.
--   3. `ops_alert_log` + `ops_alert_sends`, the throttle: at most one email per
--      alert key per hour, a cap on alert emails per hour, and a record that
--      today's summary went out so a re-run does not send it twice.
--   4. `site_settings.ops_alert_recipients` (private), editable by admins.
--   5. Two pg_cron jobs calling the app: `ops-alerts` every five minutes and
--      `ops-daily-summary` at 07:00 UTC, retried within the hour (07:00 in Accra, which keeps GMT all
--      year). Vault first, GUC second, `raise warning` when app_url is unset,
--      the same as run_catalog_scrape() in 045.
--
-- NO PII, same rule as 062: counts, ids, routes and messages the server wrote.

-- ── 1. Categories on the grouped issues ──────────────────────────────────────
ALTER TABLE error_events ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'server';

ALTER TABLE error_events DROP CONSTRAINT IF EXISTS error_events_category_check;
ALTER TABLE error_events ADD CONSTRAINT error_events_category_check CHECK (
  category IN ('server', 'server_5xx', 'client_4xx', 'client_crash', 'job', 'payment', 'notification')
);

CREATE INDEX IF NOT EXISTS idx_error_events_first_seen ON error_events (first_seen_at DESC);

-- Issues recorded before categories existed get the same guess the app makes
-- for older call sites (src/lib/logger/error-category.ts), so the first daily
-- summary does not file every payment fault under "server".
UPDATE error_events SET category = CASE
    WHEN source LIKE 'cron:%' THEN 'job'
    WHEN coalesce(source, '') || ' ' || message ~* 'paystack|payment|webhook|charge\.|refund' THEN 'payment'
    WHEN coalesce(source, '') || ' ' || message ~* 'notification|resend|whatsapp|e-?mail|send failed' THEN 'notification'
    ELSE category
  END
WHERE category = 'server';

-- ── 2. Hourly counts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_event_hourly (
  fingerprint TEXT NOT NULL,
  bucket      TIMESTAMPTZ NOT NULL,
  category    TEXT NOT NULL DEFAULT 'server',
  level       TEXT NOT NULL DEFAULT 'error',
  occurrences INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (fingerprint, bucket)
);

CREATE INDEX IF NOT EXISTS idx_error_event_hourly_bucket ON error_event_hourly (bucket DESC);

ALTER TABLE error_event_hourly ENABLE ROW LEVEL SECURITY;
-- Server-only, like error_events: no client role may read or write it.
GRANT ALL ON error_event_hourly TO service_role;

-- ── The writer, now with a category and an hourly bucket ─────────────────────
-- The old six-argument signature is dropped rather than overloaded: two
-- functions that differ only by a defaulted argument are ambiguous to
-- PostgREST. The app retries without p_category when it meets a database that
-- has not had this migration yet (src/lib/logger/error-sink.ts).
DROP FUNCTION IF EXISTS record_error_event(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION record_error_event(
  p_fingerprint TEXT,
  p_level       TEXT,
  p_message     TEXT,
  p_source      TEXT,
  p_context     JSONB,
  p_occurrences INTEGER DEFAULT 1,
  p_category    TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_n        INTEGER := greatest(coalesce(p_occurrences, 1), 1);
  v_category TEXT := CASE
    WHEN p_category IN ('server', 'server_5xx', 'client_4xx', 'client_crash', 'job', 'payment', 'notification') THEN p_category
    ELSE 'server'
  END;
  v_level    TEXT := CASE WHEN p_level = 'warn' THEN 'warn' ELSE 'error' END;
BEGIN
  INSERT INTO error_events (fingerprint, level, message, source, context, occurrences, category)
  VALUES (p_fingerprint, v_level, left(p_message, 2000), left(p_source, 200), p_context, v_n, v_category)
  ON CONFLICT (fingerprint) DO UPDATE SET
    occurrences  = error_events.occurrences + v_n,
    last_seen_at = now(),
    message      = excluded.message,
    context      = excluded.context,
    level        = excluded.level,
    category     = excluded.category,
    -- A recurrence reopens it (062): resolving is "I looked", not "hide it".
    resolved_at  = NULL,
    resolved_by  = NULL;

  INSERT INTO error_event_hourly (fingerprint, bucket, category, level, occurrences)
  VALUES (p_fingerprint, date_trunc('hour', now()), v_category, v_level, v_n)
  ON CONFLICT (fingerprint, bucket) DO UPDATE SET
    occurrences = error_event_hourly.occurrences + v_n,
    category    = excluded.category,
    level       = excluded.level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION record_error_event(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_error_event(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, TEXT) TO service_role;

-- ── 3. The throttle ──────────────────────────────────────────────────────────
-- One row per alert key (a fingerprint, "job-stale:catalog-scrape", ...): when
-- it last went out, so the same thing is not emailed every five minutes.
CREATE TABLE IF NOT EXISTS ops_alert_log (
  alert_key    TEXT PRIMARY KEY,
  level        TEXT NOT NULL,
  title        TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL,
  times_sent   INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE ops_alert_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ops_alert_log TO service_role;

-- One row per email that went out: the hourly cap counts these, the daily
-- summary checks for today's row before sending, and /admin/ops lists them.
CREATE TABLE IF NOT EXISTS ops_alert_sends (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('alert', 'daily_summary')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary_date DATE,
  subject      TEXT NOT NULL,
  alert_keys   TEXT[] NOT NULL DEFAULT '{}',
  recipients   INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ops_alert_sends_sent ON ops_alert_sends (kind, sent_at DESC);
-- Once per day, enforced by the database rather than by a read-then-write.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_alert_sends_daily ON ops_alert_sends (summary_date) WHERE kind = 'daily_summary';

ALTER TABLE ops_alert_sends ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ops_alert_sends TO service_role;

-- ── 4. Who gets the emails ───────────────────────────────────────────────────
-- PRIVATE (is_public = false): anon's read policy is USING (is_public), so a
-- visitor can never list these addresses. Admins edit it on /admin/content;
-- OPS_ALERT_RECIPIENTS in the environment overrides it when set.
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('ops_alert_recipients', '["kelanimdev@gmail.com"]'::jsonb,
   'Platform alert recipients',
   'Email addresses that get platform error alerts and the 07:00 daily health summary. A list of addresses, for example ["ops@example.com"].',
   false)
ON CONFLICT (key) DO NOTHING;

-- ── 5. The two jobs ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_ops_job(p_path TEXT) RETURNS void AS $$
DECLARE
  v_app_url     TEXT;
  v_cron_secret TEXT;
BEGIN
  -- Vault first, GUC second (045). A function that reads only the GUC installs
  -- cleanly on hosted Supabase and then silently never calls the app.
  SELECT decrypted_secret INTO v_app_url FROM vault.decrypted_secrets WHERE name = 'app_url';
  SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  v_app_url := coalesce(v_app_url, current_setting('app.settings.app_url', true));
  v_cron_secret := coalesce(v_cron_secret, current_setting('app.settings.cron_secret', true));

  IF v_app_url IS NULL OR v_app_url = '' THEN
    RAISE WARNING 'app_url not configured: set vault secret "app_url" (or app.settings.app_url)';
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := v_app_url || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce(v_cron_secret, '')),
    timeout_milliseconds := 60000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- As 061 (DB-2): a cron trigger must not be callable over RPC by any API role.
REVOKE ALL ON FUNCTION run_ops_job(TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION run_ops_alerts() RETURNS void AS $$
  SELECT run_ops_job('/api/cron/ops-alerts');
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION run_ops_daily_summary() RETURNS void AS $$
  SELECT run_ops_job('/api/cron/ops-daily-summary');
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION run_ops_alerts() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION run_ops_daily_summary() FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.unschedule('ops-alerts')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops-alerts');
-- Every five minutes, offset to :02 so it lands after reconcile-payments (:00).
SELECT cron.schedule('ops-alerts', '2-59/5 * * * *', $$ SELECT run_ops_alerts(); $$);

SELECT cron.unschedule('ops-daily-summary')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops-daily-summary');
-- 07:00 UTC = 07:00 Africa/Accra (GMT, no daylight saving). Fired four times
-- in the hour: the app claims the day in ops_alert_sends (unique per date)
-- before sending, so the later calls are no-ops unless the first one failed.
SELECT cron.schedule('ops-daily-summary', '0,15,30,45 7 * * *', $$ SELECT run_ops_daily_summary(); $$);

-- ── Retention ────────────────────────────────────────────────────────────────
-- 062's cleanup plus the new tables: hourly counts for 14 days (the spike
-- baseline needs one), alert history for 90.
SELECT cron.unschedule('cleanup-error-events')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-error-events');

SELECT cron.schedule('cleanup-error-events', '50 3 * * *', $$
  DELETE FROM error_events
  WHERE (resolved_at IS NOT NULL AND resolved_at < now() - interval '7 days')
     OR last_seen_at < now() - interval '90 days';
  DELETE FROM error_event_hourly WHERE bucket < now() - interval '14 days';
  DELETE FROM ops_alert_sends WHERE sent_at < now() - interval '90 days';
  DELETE FROM ops_alert_log WHERE last_sent_at < now() - interval '30 days';
$$);
