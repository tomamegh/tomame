-- Migration 101: the customer sends their own ride, and who arranged the rider.
--
-- Kelvin's brief (2026-11-10): delivery from the Accra warehouse stays free.
-- A customer who would rather not wait may book their own Uber, Bolt or Yango
-- to collect the parcel, and pays that ride themselves. The warehouse needs to
-- know who is coming, when, and on what number; when the rider arrives, staff
-- hand it over and the customer's order page shows the rider like any other.
--
-- WHY COLUMNS ON order_deliveries. Same reasoning as 075's courier: one row per
-- order, already readable by its owner, and a ride request is a property of THE
-- delivery, not a history (a new request replaces the old one; the history is
-- audit_logs and order_events). The hand-over then writes 075's courier columns,
-- so the rider card, email and WhatsApp work unchanged.
--
-- RLS: nothing new. The owner may SELECT their own row (017); every write is
-- the service role's, through `customer-ride.service.ts` and the warehouse.

BEGIN;

ALTER TABLE order_deliveries
  -- Who booked the rider on the courier columns: our team, or the customer.
  ADD COLUMN IF NOT EXISTS courier_arranged_by TEXT NOT NULL DEFAULT 'tomame',
  ADD COLUMN IF NOT EXISTS ride_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ride_rider_name     TEXT,
  ADD COLUMN IF NOT EXISTS ride_rider_phone    TEXT,
  ADD COLUMN IF NOT EXISTS ride_tracking_url   TEXT,
  ADD COLUMN IF NOT EXISTS ride_provider       TEXT,
  -- When the customer says the rider will reach the warehouse.
  ADD COLUMN IF NOT EXISTS ride_eta            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ride_note           TEXT;

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_courier_arranged_by_known;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_courier_arranged_by_known
  CHECK (courier_arranged_by IN ('tomame', 'customer'));

-- The rules 075 put on the courier columns, repeated for the request.
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_ride_phone_e164;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_ride_phone_e164
  CHECK (ride_rider_phone IS NULL OR ride_rider_phone ~ '^\+233[0-9]{9}$');
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_ride_url_https;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_ride_url_https
  CHECK (ride_tracking_url IS NULL OR ride_tracking_url ~* '^https://');
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_ride_provider_known;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_ride_provider_known
  CHECK (ride_provider IS NULL OR ride_provider IN ('uber', 'yango', 'bolt', 'other'));
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_ride_note_length;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_ride_note_length
  CHECK (ride_note IS NULL OR length(ride_note) <= 300);
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_ride_name_length;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_ride_name_length
  CHECK (ride_rider_name IS NULL OR length(ride_rider_name) <= 80);
-- A rider the warehouse cannot reach or recognise is not a request.
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_ride_reachable;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_ride_reachable
  CHECK (ride_requested_at IS NULL OR ride_rider_phone IS NOT NULL OR ride_tracking_url IS NOT NULL);

-- The warehouse board lists open requests, oldest first.
CREATE INDEX IF NOT EXISTS idx_order_deliveries_ride_open
  ON order_deliveries (ride_requested_at)
  WHERE ride_requested_at IS NOT NULL AND courier_dispatched_at IS NULL;

COMMENT ON COLUMN order_deliveries.ride_requested_at IS
  '101: the customer is sending their own rider to collect from the Accra warehouse. Null when they are not.';
COMMENT ON COLUMN order_deliveries.courier_arranged_by IS
  '101: tomame (our rider, free) or customer (they booked and paid the ride).';

-- Where a customer's rider collects from. Shown only to a customer who is
-- sending one, so not public. Blank fields are left off; edit in /admin/content.
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('ghana_warehouse_address',
   '{"name":"Tomame Accra warehouse","line1":"","area":"","city":"Accra","digital_address":"","phone":"","hours":"","maps_url":""}'::jsonb,
   'Accra warehouse (rider pickup)',
   'Shown to a customer who sends their own rider. Keys: name, line1, area, city, digital_address, phone, hours, maps_url (https). Blank fields are left off.',
   false)
ON CONFLICT (key) DO NOTHING;

COMMIT;
