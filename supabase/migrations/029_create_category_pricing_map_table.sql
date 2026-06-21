-- category_pricing_map: Maps TomameCategory values to pricing groups.
-- Replaces the hardcoded CATEGORY_TO_PRICING_GROUP Map in pricing-categories.ts.
-- Each TomameCategory can map to exactly one pricing group.

CREATE TABLE category_pricing_map (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tomame_category   TEXT UNIQUE NOT NULL,
  pricing_group_id  UUID NOT NULL REFERENCES pricing_groups(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE category_pricing_map ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (needed by pricing calculator on server)
CREATE POLICY "category_pricing_map_select"
  ON category_pricing_map FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "category_pricing_map_admin_insert"
  ON category_pricing_map FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can update
CREATE POLICY "category_pricing_map_admin_update"
  ON category_pricing_map FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only admins can delete
CREATE POLICY "category_pricing_map_admin_delete"
  ON category_pricing_map FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Index for join lookups
CREATE INDEX idx_category_pricing_map_group ON category_pricing_map (pricing_group_id);
