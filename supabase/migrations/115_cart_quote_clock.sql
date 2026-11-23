-- 115: a bag line's quote has its own 24-hour clock (site brief, Fix 14).
--
-- Admin Bags labelled 40 of 43 open bags "Blocked". Most were quotes past the
-- 24-hour rule (QUOTE_VALID_HOURS), which is recoverable by re-quoting at
-- today's rate. The screen could not tell, because the only clock it had was
-- the shared extraction_cache row's expiry, and `cart_items.updated_at` also
-- moves when the bag packer reassigns a box.
--
-- quoted_at is when the line's stored breakdown (`cart_items.pricing`) was
-- struck: on add, on a quantity or option change, on an admin re-quote, and
-- when the customer opens a bag whose quote has aged out (getBag re-prices
-- every line at today's rate and stores the result). Backfilled from
-- created_at, so an old line reads as expired until it is re-quoted.

BEGIN;

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ;
UPDATE cart_items SET quoted_at = created_at WHERE quoted_at IS NULL AND pricing IS NOT NULL;
ALTER TABLE cart_items ALTER COLUMN quoted_at SET DEFAULT now();

COMMENT ON COLUMN cart_items.quoted_at IS '115: when cart_items.pricing was last struck. Older than 24 hours = quote expired; re-quote at today''s rate.';

COMMIT;
