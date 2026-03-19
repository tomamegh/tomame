-- Migration 017: Create order_deliveries table
-- Tracks delivery events and shipment details for orders separately from the orders table.

CREATE TABLE order_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned')),
  estimated_delivery_date DATE,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX order_deliveries_order_id_idx  ON order_deliveries (order_id);
CREATE INDEX order_deliveries_user_id_idx   ON order_deliveries (user_id);
CREATE INDEX order_deliveries_status_idx    ON order_deliveries (status);

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_order_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_deliveries_updated_at_trigger
  BEFORE UPDATE ON order_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_order_deliveries_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE order_deliveries ENABLE ROW LEVEL SECURITY;

-- Users can read delivery records for their own orders
CREATE POLICY "users can read own order deliveries"
  ON order_deliveries FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all order deliveries
CREATE POLICY "admins can read all order deliveries"
  ON order_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only admins can insert order deliveries
CREATE POLICY "admins can insert order deliveries"
  ON order_deliveries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only admins can update order deliveries
CREATE POLICY "admins can update order deliveries"
  ON order_deliveries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- No DELETE policy — delivery records are append-only for audit purposes
