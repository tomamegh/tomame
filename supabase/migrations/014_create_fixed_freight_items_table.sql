-- Fixed freight items: pre-negotiated freight rates for recognized products
CREATE TABLE fixed_freight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  product_name TEXT NOT NULL,
  freight_rate_ghs NUMERIC NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE fixed_freight_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active fixed freight items"
  ON fixed_freight_items FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert fixed freight items"
  ON fixed_freight_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update fixed freight items"
  ON fixed_freight_items FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Index for keyword matching
CREATE INDEX idx_fixed_freight_items_active ON fixed_freight_items (is_active) WHERE is_active = true;
CREATE INDEX idx_fixed_freight_items_category ON fixed_freight_items (category);
