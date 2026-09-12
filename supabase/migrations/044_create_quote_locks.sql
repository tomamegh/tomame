-- Migration 044: quote_locks — the customer's rate lock, plus the quote constants
-- and the pre-purchase delivery-ETA inputs that read alongside it.
--
-- WHAT A LOCK IS. A lock freezes the FX ONLY: `exchange_rate` (the buffered
-- USD→GHS rate the customer is charged at), `mid_market_rate` (what it was
-- derived from) and `fx_rates` (every X→GHS mid-market rate at mint, keyed by
-- currency, USD included) so a GBP or CNY listing is frozen too. Nothing else is
-- frozen. The item price is ALWAYS re-read from the live extraction_cache
-- snapshot; `pricing` is an informational mint-time snapshot of the breakdown the
-- customer saw. It may include a customer-supplied gap-filler price and is never
-- read as a price source — not at order intake, not anywhere.
--
-- LOWER OF LOCKED AND LIVE. The line is priced twice — under the lock's FX and
-- live — and the customer gets the lower TOTAL. When live is lower the lock
-- RATCHETS DOWN: exchange_rate / mid_market_rate / fx_rates are overwritten with
-- the live values (guarded so a rate can never move up), expires_at is kept, and
-- an audit row `quote_lock_ratcheted` is written. A lock can therefore only ever
-- get cheaper for the customer, and what the quote page shows and what the order
-- is priced at come from one row.
--
-- WHO OWNS A LOCK. The quote flow is public. A signed-out visitor is identified
-- by a server-minted httpOnly cookie (`tm_quote_session`) whose value lands in
-- `session_id`; a signed-in customer by `user_id`. When a request carries both,
-- every anonymous lock for that session is ADOPTED (`user_id` set, audit
-- `quote_lock_adopted`) so the lock survives sign-in. The CHECK constraint says a
-- lock always belongs to someone.
--
-- THE CLIENT NEVER NAMES A LOCK. No route accepts a lock id or a rate; the server
-- resolves the active lock by (viewer, extraction_cache_id). A lock the client
-- could influence would be a discount the client could grant itself.
--
-- WRITES ARE SERVICE-ROLE ONLY. The authenticated role may SELECT its own rows
-- (so a future "your locked rate" screen can read through RLS) and nothing else.
-- GRANTs are explicit because a local `supabase start` stack does not carry the
-- hosted default privileges — see migration 036.

-- ── quote_locks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quote_locks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id            TEXT,
  extraction_cache_id   UUID REFERENCES extraction_cache(id) ON DELETE SET NULL,
  quantity              INT NOT NULL DEFAULT 1,
  exchange_rate         NUMERIC NOT NULL,
  mid_market_rate       NUMERIC NOT NULL,
  -- Every X→GHS mid-market rate at mint, keyed by currency, USD included.
  fx_rates              JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Informational mint-time snapshot (may carry a customer gap-filler); never a price source.
  pricing               JSONB NOT NULL,
  locked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  consumed_by_order_id  UUID REFERENCES orders(id) ON DELETE SET NULL,
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

ALTER TABLE quote_locks ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON quote_locks TO authenticated;
GRANT ALL ON quote_locks TO service_role;

CREATE POLICY "quote_locks owner read"
  ON quote_locks FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- The two lookups the server makes: "this customer's newest lock on this
-- product" and the same for an anonymous session.
CREATE INDEX IF NOT EXISTS idx_quote_locks_user_extraction
  ON quote_locks (user_id, extraction_cache_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_locks_session_extraction
  ON quote_locks (session_id, extraction_cache_id, expires_at DESC);

-- ── Quote constants ───────────────────────────────────────────────────────────
-- rate_lock_hours drives the lock's expires_at AND the "Rate locked Nh" copy, so
-- the promise and the behaviour cannot drift apart. The purchase lead days are
-- how long Tomame takes to place the store order after payment; together with
-- regions.transit_days_* and delivery_zones.extra_days they make the ETA window.

INSERT INTO pricing_constants (key, value, label, description, unit) VALUES
  ('rate_lock_hours', 24, 'Rate Lock Duration',
   'How long a quoted exchange rate is held for a customer after they view a quote', 'h'),
  ('purchase_lead_days_min', 1, 'Purchase Lead Time (min)',
   'Fewest days between a customer paying and Tomame placing the store order', 'days'),
  ('purchase_lead_days_max', 3, 'Purchase Lead Time (max)',
   'Most days between a customer paying and Tomame placing the store order', 'days')
ON CONFLICT (key) DO NOTHING;

-- ── extraction_cache cleanup: never drop a row an unexpired lock points at ────
-- Migration 035 scheduled this job inline (no function). It is re-scheduled here
-- with one more guard: a cache row referenced by a live lock is the item-price
-- source for that lock's order, so it must outlive the cache TTL like an order's
-- row does. Same 10-minute cadence, same 7-day grace.

SELECT cron.unschedule('cleanup-extraction-cache')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-extraction-cache');

SELECT cron.schedule(
  'cleanup-extraction-cache',
  '*/10 * * * *',
  $$
    update extraction_cache
    set is_valid = false
    where is_valid = true and expires_at < now();

    delete from extraction_cache ec
    where ec.expires_at < now() - interval '7 days'
      and not exists (select 1 from orders o where o.extraction_cache_id = ec.id)
      and not exists (
        select 1 from quote_locks ql
        where ql.extraction_cache_id = ec.id and ql.expires_at > now()
      );
  $$
);

-- ── quote_locks cleanup: daily, 30 days after expiry, consumed locks kept ─────
-- A consumed lock is part of an order's money trail (the audit row names it), so
-- it is never deleted here; unconsumed locks are abandoned quotes.

SELECT cron.unschedule('cleanup-quote-locks')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-quote-locks');

SELECT cron.schedule(
  'cleanup-quote-locks',
  '30 3 * * *',
  $$
    delete from quote_locks
    where expires_at < now() - interval '30 days'
      and consumed_by_order_id is null;
  $$
);
