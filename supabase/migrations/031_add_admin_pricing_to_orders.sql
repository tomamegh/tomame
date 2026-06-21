-- Add columns for admin-set pricing on needs_review orders.
-- When admin_total_ghs is set, it takes precedence over pricing.total_ghs.
-- The original pricing JSONB is preserved for audit purposes.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_total_ghs NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_pricing_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_set_by UUID REFERENCES auth.users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_set_at TIMESTAMPTZ;
