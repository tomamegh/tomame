-- Migration 141: a store tracking LINK on the order, beside the numbers (086).
--
-- Kelvin, 2026-11-23: Amazon's "Share tracking" gives a short link
-- (a.co/d/…) that opens a public tracking page, and no carrier number. The
-- hub's scan matches parcels by the number on the label, so a link can never
-- be an inbound parcel; it was refused and lost. It is kept here instead, for
-- staff to open and, when they tick "share", for the customer's message.
-- Numbers still go to inbound_parcels.
--
-- One per order (the latest pasted). Written by the service role only, through
-- the warehouse and admin purchase routes, audited as
-- `order_store_tracking_link_set` / `_cleared`.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS store_tracking_url TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_store_tracking_url_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_store_tracking_url_check
  CHECK (store_tracking_url IS NULL OR (store_tracking_url ~* '^https://' AND length(store_tracking_url) <= 500));

COMMENT ON COLUMN orders.store_tracking_url IS
  'The store''s tracking page for the trip to the US hub, when the store gave a link and no number (Amazon Share tracking). Staff only unless shared in a message. 141.';

COMMIT;
