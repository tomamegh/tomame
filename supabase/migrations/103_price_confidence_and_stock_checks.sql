-- Migration 103: a price you can trust, stock confirmed before payment, and
-- what the store actually charged.
--
-- The trust-and-polish plan (2026-11-20), Agent A:
--
--   A0  Every quote carries a price confidence (on extraction_cache.result,
--       no column needed). A single-source price is re-read in the background
--       before Pay; an unconfirmed one waits for staff. Customers can report a
--       wrong price.
--   A7  Renewed / used / low-stock / deal listings wait for staff to confirm
--       stock and condition (valid 24 h) before Pay.
--   A0b Staff record the price the store charged when they mark an order
--       purchased, so daily health can say how far quotes drift from reality.
--
-- 1. `quote_checks` — one table for both checks, because they gate the SAME
--    thing (pay) through the SAME rule (`features/extraction/pay-gate.ts`) and
--    are worked by the same people. `kind` says which. `origin = 'system'` is a
--    check the gate asked for (one open per product per kind, enforced below);
--    `origin = 'customer'` is a "Report a wrong price" or "Confirm stock" from
--    a customer, kept as their own rows so nothing a customer types can clear
--    or block a gate. Status follows:
--        checking → confirmed | pending | lapsed    (automatic price re-read)
--        pending  → confirmed | corrected | unavailable | dismissed   (staff)
--    Every staff decision is audited (`quote_check_decided`).
--
-- 2. orders.store_paid_* — the store's charged item price (per unit, before
--    tax and shipping, in the listing currency). Audited as
--    `order_store_price_recorded`.
--
-- 3. staff_alert_sends accepts `quote_check` (new staff alert event).
--
-- RLS: `quote_checks` is server-only like `staff_alert_sends` (087): RLS on, no
-- client policy. Customers reach it through routes that check ownership;
-- admins through routes that check the admin claim.

BEGIN;

-- ── 1. quote_checks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                TEXT NOT NULL CHECK (kind IN ('price', 'stock')),
  origin              TEXT NOT NULL CHECK (origin IN ('system', 'customer')),
  status              TEXT NOT NULL CHECK (status IN ('checking', 'pending', 'confirmed', 'corrected', 'unavailable', 'dismissed', 'lapsed')),
  extraction_cache_id UUID NOT NULL REFERENCES extraction_cache(id) ON DELETE CASCADE,
  product_url         TEXT NOT NULL,
  product_title       TEXT,
  platform            TEXT,
  -- The price on the quote when the check opened, and the tier that read it.
  quoted_price        NUMERIC CHECK (quoted_price IS NULL OR quoted_price > 0),
  quoted_currency     TEXT,
  price_source        TEXT,
  -- Why it opened: price-confidence reasons or stock signals, in plain words.
  reasons             TEXT[] NOT NULL DEFAULT '{}',
  -- Who asked (customer rows; system rows record the viewer whose bag needed it).
  user_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  session_id          TEXT,
  customer_note       TEXT CHECK (customer_note IS NULL OR length(customer_note) <= 500),
  reported_price      NUMERIC CHECK (reported_price IS NULL OR (reported_price > 0 AND reported_price < 1000000)),
  -- The automatic re-read (single-source prices).
  reread_price        NUMERIC,
  reread_currency     TEXT,
  reread_source       TEXT,
  reread_at           TIMESTAMPTZ,
  -- The staff decision.
  decided_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at          TIMESTAMPTZ,
  decision_note       TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 500),
  confirmed_price     NUMERIC CHECK (confirmed_price IS NULL OR confirmed_price > 0),
  substitute_url      TEXT CHECK (substitute_url IS NULL OR substitute_url ~* '^https://'),
  valid_until         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quote_checks_decided_has_actor CHECK (
    status NOT IN ('confirmed', 'corrected', 'unavailable', 'dismissed') OR decided_at IS NOT NULL
  ),
  CONSTRAINT quote_checks_corrected_has_price CHECK (status <> 'corrected' OR confirmed_price IS NOT NULL),
  CONSTRAINT quote_checks_kind_status CHECK (kind = 'price' OR status NOT IN ('checking', 'corrected', 'lapsed'))
);

-- One open system check per product per kind: concurrent bag reads cannot
-- open two, and so cannot send staff two alerts for one listing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_checks_open_system
  ON quote_checks (kind, extraction_cache_id)
  WHERE origin = 'system' AND status IN ('checking', 'pending');
-- One open report per customer per product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_checks_open_customer
  ON quote_checks (kind, extraction_cache_id, COALESCE(user_id::text, session_id))
  WHERE origin = 'customer' AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_quote_checks_extraction ON quote_checks (extraction_cache_id, created_at DESC);
-- The admin queues: open first, oldest first.
CREATE INDEX IF NOT EXISTS idx_quote_checks_queue ON quote_checks (kind, status, created_at);

ALTER TABLE quote_checks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON quote_checks TO service_role;

COMMENT ON TABLE quote_checks IS
  '103: price and stock checks that hold Pay (features/extraction/pay-gate.ts). Server-only; every staff decision is in audit_logs.';

-- ── 2. What the store charged ──────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS store_paid_price    NUMERIC,
  ADD COLUMN IF NOT EXISTS store_paid_currency TEXT,
  ADD COLUMN IF NOT EXISTS store_paid_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS store_paid_by       UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_store_paid_price_positive;
ALTER TABLE orders ADD CONSTRAINT orders_store_paid_price_positive
  CHECK (store_paid_price IS NULL OR (store_paid_price > 0 AND store_paid_price < 1000000));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_store_paid_currency_known;
ALTER TABLE orders ADD CONSTRAINT orders_store_paid_currency_known
  CHECK (store_paid_currency IS NULL OR store_paid_currency ~ '^[A-Z]{3}$');
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_store_paid_complete;
ALTER TABLE orders ADD CONSTRAINT orders_store_paid_complete
  CHECK ((store_paid_price IS NULL) = (store_paid_at IS NULL) AND (store_paid_price IS NULL) = (store_paid_currency IS NULL));

-- Daily health reads the last 30 days of recorded prices.
CREATE INDEX IF NOT EXISTS idx_orders_store_paid_at ON orders (store_paid_at) WHERE store_paid_at IS NOT NULL;

COMMENT ON COLUMN orders.store_paid_price IS
  '103: the item price the store charged per unit (before tax and shipping), in store_paid_currency. Ground truth for quoted-vs-paid drift.';

-- ── 3. Staff alert event ───────────────────────────────────────────────────
ALTER TABLE staff_alert_sends DROP CONSTRAINT IF EXISTS staff_alert_sends_event_type_check;
ALTER TABLE staff_alert_sends ADD CONSTRAINT staff_alert_sends_event_type_check CHECK (event_type IN (
  'order_placed', 'payment_succeeded', 'payment_failed',
  'order_status_changed', 'order_review', 'car_order', 'sourcing_requested',
  'customer_message', 'quote_check', 'test'));

COMMIT;
