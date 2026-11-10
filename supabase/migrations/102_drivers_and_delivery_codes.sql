-- Migration 102: drivers, and the code that proves a parcel reached its owner.
--
-- Kelvin's brief (2026-11-10): drivers sign in to the warehouse app, see the
-- orders they are taking out, photograph each hand-over and mark it delivered.
-- The customer is given a random code; the driver asks for it at the door and
-- types it in. No code, no "delivered".
--
-- THE ROLE. `profiles.role` gains 'driver'. `custom_access_token_hook` copies
-- the column into the JWT verbatim, so no hook change is needed. Every RLS
-- policy tests `role = 'admin'`, so to PostgREST a driver is a customer: they
-- read their own rows and nothing else. What a driver sees comes through
-- `/api/driver/*` on the service role, scoped to the deliveries assigned to them.
--
-- THE CODE lives on `order_deliveries` (one row per order). The customer may
-- already SELECT their own row (017), which is exactly who should read it; the
-- driver API never returns it. Six digits, one per customer's parcels in flight
-- (orders on the way to the same person share it, so a driver at one door types
-- one code). Five wrong tries lock it until staff step in.

BEGIN;

-- ── The role ────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('system', 'admin', 'user', 'warehouse', 'driver'));
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_role_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_role_check CHECK (actor_role IN ('user', 'admin', 'system', 'warehouse', 'driver'));

-- ── Who is taking it, and the code ──────────────────────────────────────────
ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS driver_id               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_assigned_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_code           TEXT,
  ADD COLUMN IF NOT EXISTS delivery_code_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_code_failures  INT NOT NULL DEFAULT 0,
  -- Who confirmed the hand-over, and whether the customer's code proved it.
  ADD COLUMN IF NOT EXISTS delivered_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_with_code     BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_delivery_code_shape;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_delivery_code_shape
  CHECK (delivery_code IS NULL OR delivery_code ~ '^[0-9]{6}$');
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_delivery_code_failures_range;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_delivery_code_failures_range
  CHECK (delivery_code_failures BETWEEN 0 AND 100);
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_driver_has_time;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_driver_has_time
  CHECK (driver_id IS NULL OR driver_assigned_at IS NOT NULL);

-- A driver's list: their open deliveries.
CREATE INDEX IF NOT EXISTS idx_order_deliveries_driver
  ON order_deliveries (driver_id, driver_assigned_at DESC) WHERE driver_id IS NOT NULL;

COMMENT ON COLUMN order_deliveries.delivery_code IS
  '102: six digits the customer reads to the driver at hand-over. Readable by the order''s owner; never returned to a driver.';
COMMENT ON COLUMN order_deliveries.driver_id IS
  '102: the driver account taking this order out. Their app lists it.';

COMMIT;
