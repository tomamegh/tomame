-- Migration 004: Create orders table
-- Run in Supabase SQL Editor

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  payment_id UUID,  -- FK to payments added in future migration when payments table exists
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'paid', 'processing', 'completed', 'cancelled')
  ),
  product_url TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_image_url TEXT,
  estimated_price_usd NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  origin_country TEXT NOT NULL CHECK (origin_country IN ('USA', 'UK', 'CHINA')),
  special_instructions TEXT,
  pricing JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own orders
CREATE POLICY "users can read own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all orders
CREATE POLICY "admins can read all orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Users can insert their own orders (user_id must match auth.uid())
CREATE POLICY "users can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only admins can update orders (status transitions are server-side)
CREATE POLICY "admins can update orders"
  ON orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();
