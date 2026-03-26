-- Recreate pricing_constants table for admin-editable pricing parameters.
-- Keys: freight_rate_per_lb, handling_fee_usd, minimum_tax_usd, fx_buffer_pct,
--        tax_pct_usa, tax_pct_uk, tax_pct_china

CREATE TABLE IF NOT EXISTS pricing_constants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  value       NUMERIC NOT NULL DEFAULT 0,
  label       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  unit        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE pricing_constants ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (needed by pricing calculator on server)
CREATE POLICY "pricing_constants_select"
  ON pricing_constants FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can update
CREATE POLICY "pricing_constants_admin_update"
  ON pricing_constants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Seed initial values
INSERT INTO pricing_constants (key, value, label, description, unit) VALUES
  ('freight_rate_per_lb',  5.00,  'Freight Rate',       'Cost per pound of freight',                    '$/lb'),
  ('handling_fee_usd',     3.00,  'Handling Fee',        'Fixed handling fee per order',                 '$'),
  ('minimum_tax_usd',      2.00,  'Minimum Tax',         'Minimum tax applied to any order',             '$'),
  ('fx_buffer_pct',        0.04,  'FX Buffer',           'Buffer percentage added on top of mid-market exchange rate', '%'),
  ('tax_pct_usa',          0.10,  'Tax % (USA)',         'Tax percentage for orders from the USA',       '%'),
  ('tax_pct_uk',           0.10,  'Tax % (UK)',          'Tax percentage for orders from the UK',        '%'),
  ('tax_pct_china',        0.08,  'Tax % (China)',       'Tax percentage for orders from China',         '%')
ON CONFLICT (key) DO NOTHING;

-- Index for quick key lookups
CREATE INDEX IF NOT EXISTS idx_pricing_constants_key ON pricing_constants (key);
