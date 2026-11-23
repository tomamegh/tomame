-- 140: every call a customer makes on the shopping assistant, so staff can see
-- who uses it and how much, per day, and spot abuse. One row per chat message
-- (one model call) and per search run (its model calls summed). Visitors are
-- kept by quote-session cookie and a hash of their IP, never the raw address.
-- Server-written only: RLS on, no policies, service role only.
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id     TEXT,
  ip_hash        TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('chat', 'search')),
  outcome        TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'rate_limited', 'sign_in_required')),
  ref_id         UUID,
  input_tokens   INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0)
);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx ON public.ai_usage_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_events_ip_idx ON public.ai_usage_events (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.ai_usage_events TO service_role;
