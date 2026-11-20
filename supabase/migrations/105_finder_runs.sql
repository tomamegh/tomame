-- 105: the AI price finder ("Tell us what you want").
--
-- A run is a job row, shaped like the paste queue (049): POST /api/finder
-- inserts it and starts the work with after(); a pg_cron sweep every minute
-- re-drives any run a deploy, crash or timeout left pending or running.
--
-- Owned by exactly one identity, the same two-identity model as 049: the
-- signed-in user, or the httpOnly `tm_quote_session` cookie for a visitor.
-- A session's runs move to the user when they are next read signed in.
--
-- Server-only. RLS is on with no client policy: every read and write goes
-- through the service role with an explicit owner filter in
-- src/db/queries/finder-runs.ts (as 103's quote_checks).

BEGIN;

CREATE TABLE IF NOT EXISTS finder_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id       TEXT,
  -- What the customer typed, and the same text normalised for the 24 h cache.
  query            TEXT NOT NULL CHECK (length(btrim(query)) BETWEEN 2 AND 200),
  query_key        TEXT NOT NULL,
  -- A budget typed beside the request (whole cedis); the parsed spec may add one.
  budget_ghs       INT CHECK (budget_ghs IS NULL OR budget_ghs > 0),
  -- The model's reading of the request, validated by zod before it is stored.
  spec             JSONB,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'no_match', 'failed')),
  -- The narration: FinderEvent[] (src/features/finder/types.ts), each step as it happened.
  events           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The ranked answer: best id, alternatives, extraction cache ids. Prices live in events.
  result           JSONB,
  -- Where the result goes: a visitor's typed address; null = the account's own.
  email            TEXT CHECK (email IS NULL OR (length(email) <= 254 AND email LIKE '%_@_%')),
  notify_whatsapp  BOOLEAN NOT NULL DEFAULT false,
  emailed_at       TIMESTAMPTZ,
  -- Store searches this run spent against job_budgets 'finder-search'.
  vendor_searches  INT NOT NULL DEFAULT 0,
  attempts         INT NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  -- Internal; the customer sees the narration, never this.
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finder_runs_one_owner CHECK ((user_id IS NULL) <> (session_id IS NULL))
);

COMMENT ON TABLE finder_runs IS
  '105: AI price finder runs. Server-only (service role); the AI never sets a price, every figure in events comes from the pricing calculator.';
COMMENT ON COLUMN finder_runs.status IS
  'pending = queued | running = a worker holds it | done = ranked result | no_match = nothing we can stand behind | failed = gave up after attempts';

-- The sweep: queued or held work, oldest first.
CREATE INDEX IF NOT EXISTS idx_finder_runs_queue
  ON finder_runs (status, updated_at) WHERE status IN ('pending', 'running');
-- The viewer's 24 h cache and rate reads.
CREATE INDEX IF NOT EXISTS idx_finder_runs_user
  ON finder_runs (user_id, query_key, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finder_runs_session
  ON finder_runs (session_id, query_key, created_at DESC) WHERE session_id IS NOT NULL;
-- Daily health.
CREATE INDEX IF NOT EXISTS idx_finder_runs_created ON finder_runs (created_at);

ALTER TABLE finder_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finder_runs FROM anon, authenticated;
GRANT ALL ON finder_runs TO service_role;

-- ── The sweep (pg_cron → pg_net → Vercel), as 045/049 ─────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION run_finder_sweep() RETURNS void AS $$
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

  PERFORM net.http_post(
    url := v_app_url || '/api/cron/finder-sweep',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, ''),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- As 061 (DB-2): a cron trigger must not be callable over RPC by any API role.
REVOKE ALL ON FUNCTION run_finder_sweep() FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.unschedule('finder-sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finder-sweep');
SELECT cron.schedule('finder-sweep', '* * * * *', $$ SELECT run_finder_sweep(); $$);

COMMIT;
