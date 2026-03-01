-- Migration 006: Create supported_stores table
-- Only admins can manage (insert, update, delete).
-- Authenticated users can only read ENABLED stores.
-- Admins can read all stores (enabled + disabled).

CREATE TABLE supported_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

ALTER TABLE supported_stores ENABLE ROW LEVEL SECURITY;

-- ── SELECT policies ─────────────────────────────────────────────────────────

-- Authenticated non-admins: can only read enabled stores
CREATE POLICY "users can read enabled stores"
  ON supported_stores FOR SELECT
  TO authenticated
  USING (
    enabled = true
    AND NOT EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Admins: can read all stores (enabled and disabled)
CREATE POLICY "admins can read all stores"
  ON supported_stores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ── WRITE policies (admin-only) ─────────────────────────────────────────────

CREATE POLICY "admins can insert supported stores"
  ON supported_stores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "admins can update supported stores"
  ON supported_stores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "admins can delete supported stores"
  ON supported_stores FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ── Seed default supported stores ──────────────────────────────────────────

INSERT INTO supported_stores (domain, display_name) VALUES
  ('amazon.com',    'Amazon US'),
  ('ebay.com',      'eBay US'),
  ('walmart.com',   'Walmart'),
  ('target.com',    'Target'),
  ('bestbuy.com',   'Best Buy'),
  ('amazon.co.uk',  'Amazon UK'),
  ('ebay.co.uk',    'eBay UK'),
  ('argos.co.uk',   'Argos'),
  ('aliexpress.com','AliExpress'),
  ('alibaba.com',   'Alibaba'),
  ('temu.com',      'Temu'),
  ('shein.com',     'SHEIN');
