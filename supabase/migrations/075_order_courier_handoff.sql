-- Migration 075: the last-mile courier handoff.
--
-- When a parcel leaves our Accra desk with a dispatch rider (or in an Uber /
-- Yango / Bolt delivery), the customer needs two things: a number to call and,
-- when there is one, a link to watch the ride. This records both on the order's
-- delivery row, plus who handed it off and when we last told the customer.
--
-- WHY COLUMNS ON `order_deliveries` AND NOT A NEW TABLE. `order_deliveries` is
-- already one row per order (050 made `order_id` UNIQUE), it is already the
-- table the customer is allowed to read for their own order, and the courier is
-- a property of THE delivery, not a history: a new link replaces the old one.
-- The history of every hand-off and re-send lives in `audit_logs`
-- (`order_courier_dispatched` / `order_courier_updated`) and in `notifications`,
-- which is where history belongs. A separate table would have needed its own
-- RLS, its own ownership join and would still have been 1:1.
--
-- RLS: nothing new is needed and nothing is loosened. The columns inherit 017's
-- policies — a customer may SELECT their own row (`auth.uid() = user_id`), and
-- every write in the app goes through the service role
-- (`src/db/queries/order-courier.ts`). The rider's phone is meant to be read by
-- the customer; that is the point of it.

ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS courier_name             TEXT,
  ADD COLUMN IF NOT EXISTS courier_phone            TEXT,
  ADD COLUMN IF NOT EXISTS courier_tracking_url     TEXT,
  ADD COLUMN IF NOT EXISTS courier_provider         TEXT,
  ADD COLUMN IF NOT EXISTS courier_dispatched_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS courier_dispatched_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_last_notified_at TIMESTAMPTZ;

-- The same rules the route's zod schema enforces, repeated here so a write that
-- skips the app (SQL editor, a future job) cannot store a number nobody can dial
-- or a `javascript:` link the customer's page would render as a button.
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_courier_phone_e164;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_courier_phone_e164
  CHECK (courier_phone IS NULL OR courier_phone ~ '^\+233[0-9]{9}$');

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_courier_url_https;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_courier_url_https
  CHECK (courier_tracking_url IS NULL OR courier_tracking_url ~* '^https://');

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_courier_provider_known;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_courier_provider_known
  CHECK (courier_provider IS NULL OR courier_provider IN ('uber', 'yango', 'bolt', 'other'));

-- A dispatched courier the customer cannot reach is not a hand-off.
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_courier_reachable;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_courier_reachable
  CHECK (
    courier_dispatched_at IS NULL
    OR courier_phone IS NOT NULL
    OR courier_tracking_url IS NOT NULL
  );

COMMENT ON COLUMN order_deliveries.courier_phone IS
  '075: the rider''s number, E.164 (+233XXXXXXXXX). Shown to the customer as a tap-to-call link.';
COMMENT ON COLUMN order_deliveries.courier_tracking_url IS
  '075: https link to a ride-hailing trip (Uber, Yango, Bolt...). Required when there is no phone.';
COMMENT ON COLUMN order_deliveries.courier_provider IS
  '075: derived server-side from the tracking URL host; never taken from the client.';
COMMENT ON COLUMN order_deliveries.courier_last_notified_at IS
  '075: when the customer was last told about this courier. Each send is also in audit_logs.';
