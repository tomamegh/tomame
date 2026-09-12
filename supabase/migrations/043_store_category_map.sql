-- Migration 043: store_category_map — a store's own category path → Tomame category.
--
-- Category selects the pricing group, so it sits on the quote's critical path.
-- Structured vendors return the store's breadcrumb ("Cell Phones › Samsung
-- Galaxy Phones") but not our taxonomy. Store taxonomies are small and stable,
-- so the mapping is learned once per (store, path): the first miss is
-- classified by Claude and written back; every later item in that store
-- category is a single indexed read. `source` says who decided — 'seed' (the
-- static maps in src/config/categories), 'llm', or 'admin' (a correction) — and
-- admin rows are never overwritten by the classifier.
--
-- Service-role write (the extraction pipeline), admin read/update for a later
-- review screen. GRANTs are explicit so local and hosted behave identically
-- (see migration 036).

CREATE TABLE IF NOT EXISTS store_category_map (
  store            TEXT NOT NULL,
  source_path      TEXT NOT NULL,           -- lower-cased breadcrumb path, " › " separated
  tomame_category  TEXT NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('seed', 'llm', 'admin')),
  confidence       NUMERIC(3,2),
  hits             INTEGER NOT NULL DEFAULT 1,
  sample_title     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID REFERENCES auth.users(id),
  PRIMARY KEY (store, source_path)
);

CREATE INDEX IF NOT EXISTS idx_store_category_map_category ON store_category_map (tomame_category);

ALTER TABLE store_category_map ENABLE ROW LEVEL SECURITY;
GRANT ALL ON store_category_map TO service_role;
GRANT SELECT, UPDATE ON store_category_map TO authenticated;

CREATE POLICY "store_category_map admin read"
  ON store_category_map FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "store_category_map admin correct"
  ON store_category_map FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
