-- Migration 098: shipment stages after the US hub, contacts per stage, and
-- delay notices — moved by the package, not by the order.
--
-- Kelvin's brief (2026-11-10): once a package leaves the US hub the customer
-- sees "In the air" and nothing else until it is delivered. There is a
-- warehouse in Ghana. The customer should see each leg (dispatched, landed and
-- clearing customs, at our Accra warehouse, ready for pickup or out for
-- delivery, delivered), know who to call at each one, and be told plainly when
-- something is late. Staff should move a whole package (or a selection of
-- orders) in one action, not order by order.
--
-- WHY NO NEW ORDER STATUSES. CLAUDE.md's state machine stays exactly as it is:
-- every leg between leaving the hub and delivery is `in_transit`. The legs are
-- `order_events` rows, the same way 050 made "At our US hub" an event and not
-- an eighth status. `delivered` is still the status transition it always was.
--
-- WHAT THIS ADDS
--  1. order_events: three stage kinds (`ghana_warehouse`, `ready_for_pickup`,
--     and the notice pair `delay` / `delay_cleared`), plus the package that
--     moved the order, a contact for that step, and a new expected date.
--  2. warehouse_packages: where the package is after it shipped (`stage`), and
--     the delay notice currently on it.
--  3. shipment_stage_settings: per stage, the customer's wording and the
--     default number to call. Admin-edited from /warehouse/stages.
--
-- RLS. Nothing loosened. order_events keeps 050's policies (owner reads their
-- own visible rows; writes are service role only). The settings table is
-- service role only, like every warehouse table: customers read the wording
-- and contact through the server, which picks the fields it shows.

BEGIN;

-- ── order_events ────────────────────────────────────────────────────────────
ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_kind_check;
ALTER TABLE order_events ADD CONSTRAINT order_events_kind_check CHECK (kind IN (
  'payment_received', 'purchased', 'hub_received', 'departed',
  'arrived_country', 'ghana_warehouse', 'ready_for_pickup', 'out_for_delivery',
  'delivered', 'completed', 'cancelled', 'note', 'delay', 'delay_cleared'));

ALTER TABLE order_events
  ADD COLUMN IF NOT EXISTS package_id    UUID REFERENCES warehouse_packages(id) ON DELETE SET NULL,
  -- Who the customer should call about THIS step. Null falls back to the
  -- stage's default in shipment_stage_settings.
  ADD COLUMN IF NOT EXISTS contact_name  TEXT CHECK (contact_name IS NULL OR length(btrim(contact_name)) BETWEEN 1 AND 80),
  ADD COLUMN IF NOT EXISTS contact_phone TEXT CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  -- A delay's revised date, or a stage's "expect it by".
  ADD COLUMN IF NOT EXISTS expected_on   DATE;

CREATE INDEX IF NOT EXISTS idx_order_events_package
  ON order_events (package_id, occurred_at DESC) WHERE package_id IS NOT NULL;

-- ── warehouse_packages: after it ships ──────────────────────────────────────
ALTER TABLE warehouse_packages
  ADD COLUMN IF NOT EXISTS stage              TEXT,
  ADD COLUMN IF NOT EXISTS stage_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stage_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notice             TEXT CHECK (notice IS NULL OR length(btrim(notice)) BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS notice_expected_on DATE,
  ADD COLUMN IF NOT EXISTS notice_at          TIMESTAMPTZ;

ALTER TABLE warehouse_packages DROP CONSTRAINT IF EXISTS warehouse_packages_stage_known;
ALTER TABLE warehouse_packages ADD CONSTRAINT warehouse_packages_stage_known CHECK (
  stage IS NULL OR stage IN ('departed', 'arrived_country', 'ghana_warehouse',
                             'ready_for_pickup', 'out_for_delivery', 'delivered'));

-- Packages that already left are, at the least, dispatched.
UPDATE warehouse_packages
   SET stage = 'departed', stage_at = shipped_at, stage_by = shipped_by
 WHERE status = 'shipped' AND stage IS NULL;

ALTER TABLE warehouse_packages DROP CONSTRAINT IF EXISTS warehouse_packages_stage_after_ship;
ALTER TABLE warehouse_packages ADD CONSTRAINT warehouse_packages_stage_after_ship CHECK (
  (status = 'shipped') = (stage IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_warehouse_packages_stage
  ON warehouse_packages (stage, stage_at DESC) WHERE stage IS NOT NULL;

-- ── shipment_stage_settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_stage_settings (
  stage            TEXT PRIMARY KEY CHECK (stage IN (
                     'paid', 'purchased', 'hub_received', 'departed', 'arrived_country',
                     'ghana_warehouse', 'ready_for_pickup', 'out_for_delivery', 'delivered')),
  title            TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 60),
  -- "Landed and clearing customs." What is happening, in the customer's words.
  description      TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 300),
  contact_name     TEXT CHECK (contact_name IS NULL OR length(btrim(contact_name)) BETWEEN 1 AND 80),
  contact_phone    TEXT CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  contact_whatsapp BOOLEAN NOT NULL DEFAULT true,
  contact_hours    TEXT CHECK (contact_hours IS NULL OR length(btrim(contact_hours)) BETWEEN 1 AND 80),
  -- How long the stage usually takes. Past this, staff see it as overdue.
  typical_days     INT CHECK (typical_days IS NULL OR typical_days BETWEEN 1 AND 90),
  updated_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shipment_stage_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shipment_stage_settings FROM anon, authenticated;
GRANT ALL ON shipment_stage_settings TO service_role;

INSERT INTO shipment_stage_settings (stage, title, description, typical_days) VALUES
  ('paid',             'Order confirmed',             'Payment received. Our buyers are placing your order with the store.', 2),
  ('purchased',        'Bought from the store',       'The store is sending it to our US hub.', 7),
  ('hub_received',     'At our US hub',               'Checked, photographed and waiting for the next flight to Ghana.', 7),
  ('departed',         'Dispatched to Ghana',         'On its way to Accra.', 5),
  ('arrived_country',  'Arrived in Ghana',            'Landed and clearing customs.', 3),
  ('ghana_warehouse',  'Processing at our warehouse', 'At our Accra warehouse, being sorted for delivery.', 2),
  ('ready_for_pickup', 'Ready for pickup',            'Waiting for you at the pickup point.', 7),
  ('out_for_delivery', 'Out for delivery',            'With our rider and on the way to you.', 1),
  ('delivered',        'Delivered',                   'Delivered. Enjoy it!', NULL)
ON CONFLICT (stage) DO NOTHING;

COMMIT;
