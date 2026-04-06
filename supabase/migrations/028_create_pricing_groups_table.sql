-- pricing_groups: Database-driven category pricing configuration.
-- Replaces the static pricing-categories.json file.
-- Each group defines shipping rates and value-based fees for a set of product categories.

CREATE TABLE pricing_groups (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  flat_rate_ghs         NUMERIC,                          -- fixed GHS shipping rate (NULL if weight-based)
  flat_rate_expression  TEXT,                              -- weight formula e.g. "5 + (w / 8)" (NULL if flat)
  value_percentage      NUMERIC NOT NULL DEFAULT 0,       -- base service fee % (e.g. 0.05 = 5%)
  value_percentage_high NUMERIC,                          -- fee % for items above threshold (nullable)
  value_threshold_usd   NUMERIC,                          -- USD threshold for tiered fee (nullable)
  default_weight_lbs    NUMERIC,                          -- fallback weight when not available (nullable)
  requires_weight       BOOLEAN NOT NULL DEFAULT false,   -- reject order if weight unavailable
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES auth.users(id),

  -- Exactly one of flat_rate_ghs / flat_rate_expression must be set
  CONSTRAINT pricing_groups_rate_check CHECK (
    (flat_rate_ghs IS NOT NULL AND flat_rate_expression IS NULL)
    OR
    (flat_rate_ghs IS NULL AND flat_rate_expression IS NOT NULL)
  ),

  -- If tiering is used, both threshold and high percentage must be set together
  CONSTRAINT pricing_groups_tier_check CHECK (
    (value_threshold_usd IS NULL AND value_percentage_high IS NULL)
    OR
    (value_threshold_usd IS NOT NULL AND value_percentage_high IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE pricing_groups ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (needed by pricing calculator on server)
CREATE POLICY "pricing_groups_select"
  ON pricing_groups FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "pricing_groups_admin_insert"
  ON pricing_groups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can update
CREATE POLICY "pricing_groups_admin_update"
  ON pricing_groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can delete
CREATE POLICY "pricing_groups_admin_delete"
  ON pricing_groups FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Indexes
CREATE INDEX idx_pricing_groups_slug ON pricing_groups (slug);
CREATE INDEX idx_pricing_groups_active ON pricing_groups (is_active) WHERE is_active = true;
