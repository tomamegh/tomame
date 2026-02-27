-- Migration 006: Create supported_stores table
-- Run in Supabase SQL Editor

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

-- All authenticated users can read (needed for frontend display)
CREATE POLICY "authenticated users can read supported stores"
  ON supported_stores FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert
CREATE POLICY "admins can insert supported stores"
  ON supported_stores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Only admins can update
CREATE POLICY "admins can update supported stores"
  ON supported_stores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "admins can delete supported stores"
  ON supported_stores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Seed default stores
INSERT INTO supported_stores (domain, display_name)
VALUES
  ('amazon.com',   'Amazon US'),
  ('amazon.co.uk', 'Amazon UK'),
  ('ebay.com',     'eBay US'),
  ('ebay.co.uk',   'eBay UK');
