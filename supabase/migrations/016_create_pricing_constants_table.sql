-- Pricing constants: admin-editable formula-based pricing parameters
CREATE TABLE pricing_constants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value NUMERIC NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

-- RLS
ALTER TABLE pricing_constants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pricing constants"
  ON pricing_constants FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can insert pricing constants"
  ON pricing_constants FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update pricing constants"
  ON pricing_constants FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed initial values
INSERT INTO pricing_constants (key, value, description) VALUES
  ('freight_rate_per_lb', 6.50, 'International freight cost per lb (USD)'),
  ('handling_fee_usd', 15.00, 'Flat handling fee per order (USD)'),
  ('fx_buffer_pct', 0.04, 'FX buffer percentage (4%)'),
  ('volumetric_divisor', 139, 'Volumetric weight divisor for inches');
