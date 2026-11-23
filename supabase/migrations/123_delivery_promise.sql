-- Migration 123: the first-stage delivery promise (Seamless Roadmap, Initiative 2).
--
-- At payment the customer is told the usual window, counted from the day they
-- paid (`regions.transit_days_min/max` + the default zone's extra days). The
-- quote's own window (`pricing.delivery_eta_from/to`) counts from the day it
-- was quoted, which can be a day earlier, and the admin's `eta_from/eta_to`
-- (050) is a confirmed window. Neither is what we promised at payment, and the
-- accuracy numbers (how often we kept that promise) need exactly that, so it is
-- written once, by the server, when the order turns paid, and never moved.
--
-- No grant to `authenticated`: server-written only.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promised_from DATE,
  ADD COLUMN IF NOT EXISTS promised_to   DATE,
  ADD COLUMN IF NOT EXISTS promised_at   TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_promise_window_ordered;
ALTER TABLE orders ADD CONSTRAINT orders_promise_window_ordered
  CHECK (promised_from IS NULL OR promised_to IS NULL OR promised_to >= promised_from);

COMMENT ON COLUMN orders.promised_from IS
  '123. First day of the window promised at payment (paid day + region transit min + zone days). Written once.';
COMMENT ON COLUMN orders.promised_to IS
  '123. Last day of the window promised at payment. Written once.';
COMMENT ON COLUMN orders.promised_at IS
  '123. When the payment-time promise was stamped; NULL = never promised (paid before 123, or no region transit days).';

COMMIT;
