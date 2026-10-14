-- The store shipping service a customer chose for a bag line (093).
--
-- eBay offers several services to the hub (USPS Ground $14.20, FedEx $24.57
-- to New York, 2026-10-11) and the snapshot now carries them all
-- (`extraction_cache.result.product.metadata.storeShippingOptions`). The
-- quote lets the customer pick one; the choice is a code the server resolves
-- against the snapshot's own list on every re-price, so the browser can only
-- choose among the store's prices, never name one. Null = the cheapest service.
-- The order's `pricing.store_shipping_option` records what was charged.

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS store_shipping_code TEXT
  CHECK (store_shipping_code IS NULL OR length(store_shipping_code) BETWEEN 1 AND 80);

-- The hub's postal code now matters: eBay prices shipping to it.
UPDATE site_settings
SET description = 'Printed on every package label as the return address, and the destination stores quote shipping to. Keys: name, line1, line2, city, postal_code, phone, email. Blank fields are left off the label; postal_code is the hub ZIP (eBay shipping rates are quoted to it).'
WHERE key = 'warehouse_address';
