-- Migration 086: inbound parcels (the store's tracking number, linked to our
-- order). Warehouse and admin only.
--
-- Kelvin's brief (2026-10-01): when a parcel from Amazon, UPS, USPS, FedEx or an
-- eBay seller reaches the hub, the operator scans the carrier barcode and the
-- parcel is linked to the Tomame order it belongs to. The hub can then answer
-- three questions it cannot today: which order is this box, which parcels are we
-- still waiting for, and which arrived that nobody expected.
--
-- WHY A TABLE AND NOT A COLUMN ON orders. The relation is many-to-many. One
-- Amazon order of three items often ships as two boxes (two parcels, one order),
-- and a customer's three orders from one eBay seller can arrive in one envelope
-- (one parcel, three orders). `orders.tracking_number` (008) is the OUTBOUND
-- leg's number, and that too is internal.
--
-- WHO WRITES. Admins and warehouse operators, through `/api/warehouse/inbound*`
-- on the service role. Every mutation is audited (`warehouse_inbound_*` actions,
-- which `warehouse_activity_feed()` (082) already merges into the admin's
-- timeline by prefix). Scans go to `warehouse_activity` like every other scan.
--
-- WHO READS. The warehouse API only, on the service role. There is no policy
-- for `anon` or `authenticated`, the same posture as 081's packages.
--
-- CARRIER NUMBERS ARE INTERNAL (owner rule, 2026-10-01). Customers see and
-- search by Tomame's number alone (`orders.order_no`). These tables are never
-- read by the public `/track` lookup, which matches `order_no` and nothing else.

BEGIN;

-- ── The normalised key ──────────────────────────────────────────────────────
-- Upper case, letters and digits only. "1z 999 aa1 0123 4567 84" and
-- "1Z999AA10123456784" are the same parcel. The TypeScript normaliser
-- (`features/warehouse/inbound/tracking-number.ts`) does more (it strips the
-- USPS `420`+ZIP routing prefix a GS1 barcode carries) and always hands this
-- function's output shape to the database, so typed and scanned values meet.
CREATE OR REPLACE FUNCTION public.tracking_key(p_value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(p_value, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- ── inbound_parcels ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbound_parcels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- As printed: grouped for reading, never parsed again.
  tracking_number  TEXT NOT NULL CHECK (length(btrim(tracking_number)) BETWEEN 6 AND 80),
  -- The match key. Unique: one physical parcel, one row.
  tracking_key     TEXT NOT NULL CHECK (tracking_key ~ '^[A-Z0-9]{6,60}$'),
  -- A guess from the number's shape, for the operator's eye. Never trusted.
  carrier          TEXT CHECK (carrier IS NULL OR carrier IN
                     ('amazon', 'ups', 'usps', 'fedex', 'dhl', 'ontrac', 'royal_mail', 'other')),
  -- expected:  registered ahead (an admin pasted it from the store's email), not here yet.
  -- arrived:   scanned at the hub and linked to at least one order.
  -- unmatched: scanned at the hub, linked to no order. The one to chase.
  status           TEXT NOT NULL DEFAULT 'expected'
                     CHECK (status IN ('expected', 'arrived', 'unmatched')),
  -- How the row came to exist.
  source           TEXT NOT NULL CHECK (source IN ('registered', 'scanned')),
  -- The store's own order number ("114-3902…"), when the admin had it.
  store_order_ref  TEXT CHECK (store_order_ref IS NULL OR length(store_order_ref) <= 80),
  note             TEXT CHECK (note IS NULL OR length(note) <= 300),
  registered_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  arrived_at       TIMESTAMPTZ,
  arrived_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inbound_parcels_arrived_has_time CHECK (status = 'expected' OR arrived_at IS NOT NULL),
  CONSTRAINT inbound_parcels_key_matches CHECK (tracking_key = public.tracking_key(tracking_key))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_parcels_tracking_key ON inbound_parcels (tracking_key);
-- The two lists the hub works: expected (oldest first, for aging) and unmatched.
CREATE INDEX IF NOT EXISTS idx_inbound_parcels_status ON inbound_parcels (status, created_at);

-- ── inbound_parcel_orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbound_parcel_orders (
  parcel_id   UUID NOT NULL REFERENCES inbound_parcels(id) ON DELETE CASCADE,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  linked_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parcel_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_inbound_parcel_orders_order ON inbound_parcel_orders (order_id);

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_inbound_parcels_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_inbound_parcels_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_inbound_parcels_updated_at ON inbound_parcels;
CREATE TRIGGER trg_inbound_parcels_updated_at
  BEFORE UPDATE ON inbound_parcels
  FOR EACH ROW EXECUTE FUNCTION public.touch_inbound_parcels_updated_at();

-- ── RLS: service role only ──────────────────────────────────────────────────
ALTER TABLE inbound_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_parcel_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbound_parcels FROM anon, authenticated;
REVOKE ALL ON inbound_parcel_orders FROM anon, authenticated;
GRANT ALL ON inbound_parcels TO service_role;
GRANT ALL ON inbound_parcel_orders TO service_role;

COMMIT;
