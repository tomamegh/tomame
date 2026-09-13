-- Migration 049: the paste queue — extraction becomes a background job, and a
-- bag line can exist before its price does.
--
-- WHY. Extraction is a race across paid vendors with a 25 s budget
-- (config/extraction.ts). Today `POST /api/products/extract` holds the customer's
-- request open for that whole budget, so a slow store means a spinner they cannot
-- leave, and two links cannot be read at once. Worse, navigating away aborts the
-- function and the work is simply lost.
--
-- So the paste becomes a JOB. `extraction_requests` — already the "(viewer, link)"
-- record — gains job state, and the paste endpoint returns as soon as the row
-- exists. The same invocation starts the work with `after()`, so there is no
-- queue latency on the happy path; a pg_cron sweep picks up anything that was
-- dropped mid-flight (a deploy, a crash, a Vercel timeout), which is the part
-- `after()` alone cannot promise.
--
-- WHY extraction_requests AND NOT A NEW TABLE. A parallel `extraction_jobs` would
-- have to be kept in sync with this table's (viewer, link) uniqueness, and the two
-- would disagree the first time one write failed. This table already answers
-- "which link did this viewer ask for"; "how did that go" belongs on the same row.
--
-- ANONYMOUS VIEWERS. The quote flow is public (CLAUDE.md), and 048 already gave
-- carts a `session_id` for the httpOnly `tm_quote_session` cookie. 046 made
-- `extraction_requests.user_id` NOT NULL because only a signed-in customer had a
-- Home card to show. A signed-out visitor can now paste, walk away and come back
-- to a priced bag, so the same two-identity model applies here: exactly one of
-- `user_id` / `session_id`, adopted onto the user at sign-in like a cart.

-- ── extraction_requests: the job ──────────────────────────────────────────────
ALTER TABLE extraction_requests
  ADD COLUMN IF NOT EXISTS session_id  TEXT,
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'running', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS attempts    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  -- Customer-readable. The extractor never throws (it degrades to a partial
  -- product with `messages`), so this is for the cases that never got that far.
  ADD COLUMN IF NOT EXISTS error       TEXT;

-- DEFAULT 'ready', not 'pending': every row that exists before this migration was
-- written by the old synchronous path, which only recorded a request AFTER the
-- extraction finished. Defaulting them to 'pending' would hand the sweeper a
-- backlog of work that is already done.
COMMENT ON COLUMN extraction_requests.status IS
  'pending = queued, nothing has run | running = a worker holds it | ready = extraction_cache_id is usable | failed = gave up after attempts';

-- user_id becomes nullable so a signed-out visitor can own a request through
-- session_id. The XOR check keeps a row from being owned by both or neither.
ALTER TABLE extraction_requests ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE extraction_requests
  DROP CONSTRAINT IF EXISTS extraction_requests_one_owner;
ALTER TABLE extraction_requests
  ADD CONSTRAINT extraction_requests_one_owner
  CHECK ((user_id IS NULL) <> (session_id IS NULL));

-- 046's UNIQUE (user_id, url_hash) stops enforcing anything once user_id is NULL
-- (SQL NULLs are never equal), so a signed-out visitor pasting the same link
-- twice would get two rows.
--
-- `owner_key` collapses the two identities into the one column the uniqueness is
-- actually about. A pair of PARTIAL unique indexes would express the same rule,
-- but ON CONFLICT cannot infer a partial index unless the statement repeats its
-- WHERE predicate — which PostgREST has no way to send, so every upsert answers
-- 42P10. One plain unique index over a generated column keeps the upsert atomic,
-- which is what stops two simultaneous pastes of the same link from racing.
ALTER TABLE extraction_requests DROP CONSTRAINT IF EXISTS extraction_requests_user_id_url_hash_key;
ALTER TABLE extraction_requests
  ADD COLUMN IF NOT EXISTS owner_key TEXT
  GENERATED ALWAYS AS (coalesce(user_id::text, session_id)) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS uq_extraction_requests_owner
  ON extraction_requests (owner_key, url_hash);

-- The sweeper's only query: oldest unfinished work first.
CREATE INDEX IF NOT EXISTS idx_extraction_requests_queue
  ON extraction_requests (status, updated_at) WHERE status IN ('pending', 'running');

-- 046's read policy names auth.uid() only. A signed-out visitor reads through the
-- service role (the route holds the cookie and scopes the query), so no anon
-- policy is added here — the cookie must never become a bearer token for PostgREST.
DROP POLICY IF EXISTS "extraction_requests owner read" ON extraction_requests;
CREATE POLICY "extraction_requests owner read"
  ON extraction_requests FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "extraction_requests owner write" ON extraction_requests;
CREATE POLICY "extraction_requests owner write"
  ON extraction_requests FOR ALL TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

-- ── cart_items: a line before its price ───────────────────────────────────────
-- The approved shape (2026-09-13): "add to bag" works the moment a link is
-- pasted. The line names the REQUEST while the job runs and the CACHE row once it
-- lands; the bag prices it from the cache exactly as it always has.
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS extraction_request_id UUID REFERENCES extraction_requests(id) ON DELETE SET NULL;

ALTER TABLE cart_items ALTER COLUMN extraction_cache_id DROP NOT NULL;

-- A line must name something. Without this a bug could leave a row pointing at
-- neither, which the bag would render as a blank line it can never resolve.
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_names_a_product;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_names_a_product
  CHECK (extraction_cache_id IS NOT NULL OR extraction_request_id IS NOT NULL);

-- 048's UNIQUE (cart_id, extraction_cache_id) stops de-duplicating as soon as the
-- cache id is NULL, so the same link pasted twice while still reading would add
-- two pending lines. Mirror it on the request id.
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_extraction_cache_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_cache
  ON cart_items (cart_id, extraction_cache_id) WHERE extraction_cache_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_request
  ON cart_items (cart_id, extraction_request_id) WHERE extraction_request_id IS NOT NULL;

-- ── assisted_requests: "tell us what you want and a buyer will sort it out" ────
-- The 20 s escape hatch. When extraction is taking too long the customer
-- describes the item in their own words and a buyer picks it up ON WHATSAPP
-- (approved 2026-09-13 over a phone call). The link is already known, so the
-- description is the missing half, not the whole order.
--
-- `phone` is captured here rather than read from `profiles`: profiles has no
-- phone column until Phase 6, and the number a customer wants to be reached on
-- for one purchase is not necessarily their account's.
CREATE TABLE IF NOT EXISTS assisted_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id            TEXT,
  extraction_request_id UUID REFERENCES extraction_requests(id) ON DELETE SET NULL,
  product_url           TEXT NOT NULL,
  -- What the customer typed. The whole point of the form.
  description           TEXT NOT NULL CHECK (length(btrim(description)) > 0),
  phone                 TEXT NOT NULL CHECK (length(btrim(phone)) > 0),
  status                TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'contacted', 'resolved', 'cancelled')),
  -- Filled when a buyer picks it up, so the queue can be worked and audited.
  handled_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  contacted_at          TIMESTAMPTZ,
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (session_id IS NULL))
);
ALTER TABLE assisted_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON assisted_requests TO authenticated;
GRANT ALL ON assisted_requests TO service_role;

-- Owner reads their own; every write goes through the service role, because the
-- status and `handled_by` are staff facts a customer must not set.
CREATE POLICY "assisted_requests owner read"
  ON assisted_requests FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "assisted_requests admin read"
  ON assisted_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_assisted_requests_queue
  ON assisted_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assisted_requests_user
  ON assisted_requests (user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- ── The sweeper ───────────────────────────────────────────────────────────────
-- `after()` starts every paste in its own invocation, so this is the safety net,
-- not the engine: it exists for work dropped mid-flight (a deploy, a crash, a
-- function timeout). Every minute, because a customer who walked away is waiting
-- on it. The route bounds how much it takes per run (one small batch, well inside
-- Vercel's 300 s cap) — the approved pg_cron → pg_net → Vercel shape.
--
-- Vault first, GUC second, exactly as run_catalog_scrape() does (045:259) and for
-- the same reason: `alter database postgres set app.settings.*` answers 42501 on
-- hosted Supabase, so a function reading ONLY the GUC installs cleanly, warns once
-- per schedule and never calls the app — a cron that looks healthy and does nothing.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION run_sweep_extractions() RETURNS void AS $$
DECLARE
  v_app_url text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_app_url
  FROM vault.decrypted_secrets WHERE name = 'app_url';

  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  v_app_url := coalesce(v_app_url, current_setting('app.settings.app_url', true));
  v_cron_secret := coalesce(v_cron_secret, current_setting('app.settings.cron_secret', true));

  IF v_app_url IS NULL OR v_app_url = '' THEN
    RAISE WARNING 'app_url not configured: set vault secret "app_url" (or app.settings.app_url)';
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := v_app_url || '/api/cron/sweep-extractions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
    ),
    timeout_milliseconds := 60000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.unschedule('sweep-extractions')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-extractions');

SELECT cron.schedule('sweep-extractions', '* * * * *', $$ SELECT run_sweep_extractions(); $$);
