-- 125: delivery windows as real data (Seamless Roadmap, Initiative 5).
--
-- * `delivery_window_slots`: the windows a customer may prefer, admin-editable
--   on /admin/content (user's choice, 23 Nov 2026: Morning 9-12, Afternoon
--   12-3, Evening 3-6, Accra time).
-- * `order_groups.delivery_window_pref`: the slot the customer prefers for a
--   checkout, chosen on the order page before its flight's box closes.
-- * `order_deliveries.window_start/window_end`: the 2-hour window staff set when
--   the order goes out for delivery, shown with the rider's name.

BEGIN;

INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('delivery_window_slots',
   '[{"key":"morning","label":"Morning","from":"09:00","to":"12:00"},{"key":"afternoon","label":"Afternoon","from":"12:00","to":"15:00"},{"key":"evening","label":"Evening","from":"15:00","to":"18:00"}]'::jsonb,
   'Delivery windows customers can prefer',
   'A list of {key, label, from, to} in Accra time (HH:MM). Customers pick one on the order page before the flight; staff set the exact 2-hour window when it goes out for delivery. Keep a key once customers have chosen it.',
   true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE order_groups
  ADD COLUMN IF NOT EXISTS delivery_window_pref TEXT,
  ADD COLUMN IF NOT EXISTS delivery_window_pref_at TIMESTAMPTZ;

COMMENT ON COLUMN order_groups.delivery_window_pref IS
  '125: the customer''s preferred delivery window, a key of site_settings.delivery_window_slots. NULL = no preference.';

ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_end TIMESTAMPTZ;

ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_window_order;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_window_order
  CHECK (window_start IS NULL OR (window_end IS NOT NULL AND window_end > window_start));

COMMENT ON COLUMN order_deliveries.window_start IS
  '125: start of the delivery window staff gave the customer at Out for delivery (usually 2 hours).';

COMMIT;
