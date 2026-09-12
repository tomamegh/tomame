-- Migration 041: price watches, price observations, and notification read state.
--
-- extraction_requests was split out of this migration into 046 — it belongs with
-- the extraction pipeline, not with Phase 2.
--
-- Backs the Phase 2 app shell and Home screen. Everything the Home screen renders
-- must come from a table or the live pricing engine — no hardcoded arrays in JSX.
-- Three of its panels have no source today and are created here.
--
-- WHY price_observations IS SEPARATE FROM price_watches. extraction_cache is a
-- 6-hour cache, not a price series — it cannot answer "lowest in 30 days" or draw
-- a sparkline. Each daily re-check appends one immutable observation; every figure
-- the price-watch card shows (7-day delta, 30-day low, the sparkline, the "N
-- watching" count) is derived from these two tables and nothing is stored twice.
--
-- ACCESS MODEL. price_watches is per-customer data: owner-scoped RLS, reachable
-- by the cookie-bound authenticated client.
-- price_observations is owner-READ (through its parent watch) and service-role
-- WRITE, because only the daily cron may append to a price series — a customer who
-- could insert observations could fabricate a price history.
--
-- GRANTs are explicit on purpose: hosted Supabase configures ALTER DEFAULT
-- PRIVILEGES on `public` so new tables are reachable, but a local `supabase start`
-- stack does not. Relying on that default makes local behaviour differ from hosted.
-- See migration 036 for the full note.

-- ── price_watches — one watched product per customer ──────────────────────────
-- baseline_* is the price when the watch was created and never changes; last_* is
-- the most recent observation, denormalised so the list renders without touching
-- price_observations. product_name / product_image_url are snapshotted for the same
-- reason: extraction_cache may be pruned, and the row must still render.
--
-- consecutive_failures and last_error exist so the daily job can back off a link
-- that has started 404ing instead of burning scraper credit on it every night, and
-- so an admin can see why a watch went quiet. is_active is the pause switch.
CREATE TABLE IF NOT EXISTS price_watches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_url          TEXT NOT NULL,
  url_hash             TEXT NOT NULL,
  product_name         TEXT,
  product_image_url    TEXT,
  extraction_cache_id  UUID REFERENCES extraction_cache(id) ON DELETE SET NULL,
  baseline_price_usd   NUMERIC,
  baseline_total_ghs   NUMERIC,
  last_price_usd       NUMERIC,
  last_total_ghs       NUMERIC,
  last_checked_at      TIMESTAMPTZ,
  consecutive_failures INT NOT NULL DEFAULT 0,
  last_error           TEXT,
  notify_on_drop       BOOLEAN NOT NULL DEFAULT true,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, url_hash)
);

ALTER TABLE price_watches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON price_watches TO authenticated;
GRANT ALL ON price_watches TO service_role;

CREATE POLICY "price_watches owner read"
  ON price_watches FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "price_watches owner write"
  ON price_watches FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- The card's list query: this customer's active watches, newest first.
CREATE INDEX IF NOT EXISTS idx_price_watches_user
  ON price_watches (user_id, is_active, created_at DESC);

-- The daily job's claim query: least-recently-checked active watches first, so a
-- per-run cap still gives every watch a turn. NULLS FIRST puts brand-new watches
-- at the front of the queue.
CREATE INDEX IF NOT EXISTS idx_price_watches_due
  ON price_watches (last_checked_at ASC NULLS FIRST) WHERE is_active;

-- ── price_observations — immutable price series ───────────────────────────────
-- Append-only in practice: no UPDATE or DELETE grant to authenticated, and no
-- write policy at all. exchange_rate is stored per observation because total_ghs
-- is only interpretable against the rate that produced it — without it a GH₵ drop
-- caused by the cedi strengthening is indistinguishable from a real price cut.
CREATE TABLE IF NOT EXISTS price_observations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id      UUID NOT NULL REFERENCES price_watches(id) ON DELETE CASCADE,
  price_usd     NUMERIC NOT NULL,
  total_ghs     NUMERIC NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  observed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE price_observations ENABLE ROW LEVEL SECURITY;
-- SELECT only for customers; the daily cron writes through the service role.
GRANT SELECT ON price_observations TO authenticated;
GRANT ALL ON price_observations TO service_role;

CREATE POLICY "price_observations owner read"
  ON price_observations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM price_watches
    WHERE price_watches.id = price_observations.watch_id
      AND price_watches.user_id = auth.uid()
  ));

-- Sparkline and history queries: one watch, newest observations first.
CREATE INDEX IF NOT EXISTS idx_price_observations_watch
  ON price_observations (watch_id, observed_at DESC);

-- ── notifications.read_at — unread state for the nav bell ─────────────────────
-- NULL means unread; the bell's dot is `count(*) where user_id = me and read_at
-- is null`. No client UPDATE policy is added: migration 019 established that all
-- writes to this table go through the service-role client, and RLS cannot restrict
-- an UPDATE to a single column, so a client policy here would also let a customer
-- rewrite `status` or `payload`. The read/read-all routes verify ownership in the
-- service layer and write as service role.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Partial index: the unread count is the only query, and it runs on every page load
-- of the app shell.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id) WHERE read_at IS NULL;
