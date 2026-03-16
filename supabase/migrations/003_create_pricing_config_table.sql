-- Migration 003: Create pricing_config table
-- Run in Supabase SQL Editor

CREATE TABLE pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL UNIQUE CHECK (region IN ('USA', 'UK', 'CHINA')),
  base_shipping_fee_usd NUMERIC NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  service_fee_percentage NUMERIC NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read pricing (needed for price display)
CREATE POLICY "authenticated users can read pricing config"
  ON pricing_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert
CREATE POLICY "admins can insert pricing config"
  ON pricing_config FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only admins can update
CREATE POLICY "admins can update pricing config"
  ON pricing_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Seed default pricing for all 3 regions
INSERT INTO pricing_config (region, base_shipping_fee_usd, exchange_rate, service_fee_percentage)
VALUES
  ('USA',   15.00, 14.50, 0.10),
  ('UK',    18.00, 18.00, 0.10),
  ('CHINA', 10.00, 2.00,  0.10);
