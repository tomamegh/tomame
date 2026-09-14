-- Migration 062: error tracking, in the database we already have.
--
-- WHY NOT A VENDOR. The platform had no error tracking at all: `logger.error`
-- wrote a JSON line to Vercel's function log, which is searchable for a short
-- retention and alerts on nothing. Every silent failure this codebase has had
-- (a notification log that rendered empty for weeks, an upsert with no matching
-- index, payments that never settled) was an error nobody saw. A paid vendor is
-- a decision for later; this is the free half that works today, needs no
-- signup, and keeps the data where the rest of the operational history lives.
--
-- GROUPED, like an issue tracker rather than a log. Rows are keyed by a
-- fingerprint of the normalised message and its source, so ten thousand
-- occurrences of one bug are one row with a count, and the Health screen can
-- say "this started an hour ago" instead of drowning.
--
-- NO PII. The writer redacts before it ever reaches here (see
-- src/lib/logger/error-sink.ts): no addresses, no names, no product URLs tied
-- to a person. Ids and metrics only, the same rule audit_logs follows.
CREATE TABLE IF NOT EXISTS error_events (
  fingerprint   TEXT PRIMARY KEY,
  level         TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn')),
  -- The most recent occurrence's wording; the fingerprint is what groups them.
  message       TEXT NOT NULL,
  -- Where it happened: a route path, a job name, a service. Never a user id.
  source        TEXT,
  context       JSONB,
  occurrences   INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when an admin has dealt with it. A later occurrence clears it again,
  -- so a bug that comes back is loud rather than quietly filed.
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_error_events_last_seen ON error_events (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_events_open ON error_events (last_seen_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;
-- Server-only. The admin screen reads it through the service role behind an
-- admin check; no client role may see it at all.
GRANT ALL ON error_events TO service_role;

-- ── The writer ────────────────────────────────────────────────────────────────
-- An RPC because PostgREST cannot express "increment on conflict", and because
-- one round trip per error matters when the app is already unhealthy.
CREATE OR REPLACE FUNCTION record_error_event(
  p_fingerprint TEXT,
  p_level       TEXT,
  p_message     TEXT,
  p_source      TEXT,
  p_context     JSONB,
  p_occurrences INTEGER DEFAULT 1
) RETURNS void AS $$
  INSERT INTO error_events (fingerprint, level, message, source, context, occurrences)
  VALUES (p_fingerprint, coalesce(p_level, 'error'), left(p_message, 2000), left(p_source, 200), p_context, greatest(coalesce(p_occurrences, 1), 1))
  ON CONFLICT (fingerprint) DO UPDATE SET
    occurrences  = error_events.occurrences + greatest(coalesce(p_occurrences, 1), 1),
    last_seen_at = now(),
    message      = excluded.message,
    context      = excluded.context,
    level        = excluded.level,
    -- A recurrence reopens it. Resolving a bug that is still happening should
    -- not be a way to make it invisible.
    resolved_at  = NULL,
    resolved_by  = NULL;
$$ LANGUAGE sql SECURITY DEFINER;

REVOKE ALL ON FUNCTION record_error_event(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_error_event(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO service_role;

-- ── Retention ─────────────────────────────────────────────────────────────────
-- Pure SQL, so it needs no route and cannot fail the way an HTTP job can.
-- Resolved issues go after a week, untouched ones after 90 days.
SELECT cron.unschedule('cleanup-error-events')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-error-events');

SELECT cron.schedule('cleanup-error-events', '50 3 * * *', $$
  DELETE FROM error_events
  WHERE (resolved_at IS NOT NULL AND resolved_at < now() - interval '7 days')
     OR last_seen_at < now() - interval '90 days';
$$);
