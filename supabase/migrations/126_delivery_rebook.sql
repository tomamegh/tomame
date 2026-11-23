-- 126: a missed delivery is rebooked by the customer in one tap (Seamless Roadmap, Initiative 5).
--
-- The customer picks the next window on the order page; staff are alerted and
-- send it out again, which clears the request (the next hand-off is the answer).

BEGIN;

ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS rebook_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rebook_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rebook_window_end TIMESTAMPTZ;

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_rebook_window_order;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_rebook_window_order
  CHECK (rebook_window_start IS NULL OR (rebook_window_end IS NOT NULL AND rebook_window_end > rebook_window_start));

COMMENT ON COLUMN order_deliveries.rebook_requested_at IS
  '126: the customer missed the rider and asked for the window in rebook_window_start/end. Cleared when staff send it out again.';

COMMIT;
