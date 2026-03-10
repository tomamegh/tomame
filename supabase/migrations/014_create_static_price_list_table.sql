-- Migration 014: Create static_price_list table
-- Fixed/all-inclusive GHS prices for known products (e.g., iPhones, iPads, gaming consoles).
-- When a product matches a static price entry, the customer pays exactly that amount
-- with no additional shipping, service fee, or exchange rate calculations.

CREATE TABLE static_price_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price_ghs NUMERIC NOT NULL CHECK (price_ghs > 0),
  price_min_ghs NUMERIC CHECK (price_min_ghs > 0),
  price_max_ghs NUMERIC CHECK (price_max_ghs > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),

  -- If both min and max are set, min must be <= max
  CONSTRAINT price_range_valid CHECK (
    price_min_ghs IS NULL OR price_max_ghs IS NULL OR price_min_ghs <= price_max_ghs
  )
);

-- Index for fast lookups by category and active status
CREATE INDEX idx_static_price_list_active ON static_price_list (is_active, category);

-- Enable RLS
ALTER TABLE static_price_list ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active prices (needed for price display)
CREATE POLICY "Authenticated users can read static prices"
  ON static_price_list FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert static prices"
  ON static_price_list FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Only admins can update
CREATE POLICY "Admins can update static prices"
  ON static_price_list FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Only admins can delete
CREATE POLICY "Admins can delete static prices"
  ON static_price_list FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
