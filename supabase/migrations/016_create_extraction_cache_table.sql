-- Migration 016: Create extraction_cache table
-- Caches scraped product data per user + URL to avoid re-scraping the same
-- product within a 5-hour window. Keyed by a simple hash of the normalized URL.

CREATE TABLE extraction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  url_hash TEXT NOT NULL,
  product_url TEXT NOT NULL,
  platform TEXT NOT NULL,
  country TEXT,
  extraction_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One cache entry per user + URL hash
  CONSTRAINT uq_extraction_cache_user_url UNIQUE (user_id, url_hash)
);

-- Fast lookup by user + url_hash + recency
CREATE INDEX idx_extraction_cache_lookup
  ON extraction_cache (user_id, url_hash, created_at DESC);

-- Enable RLS
ALTER TABLE extraction_cache ENABLE ROW LEVEL SECURITY;

-- Users can only read their own cached extractions
CREATE POLICY "Users can read own extraction cache"
  ON extraction_cache FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own cache entries
CREATE POLICY "Users can insert own extraction cache"
  ON extraction_cache FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own stale cache entries
CREATE POLICY "Users can delete own extraction cache"
  ON extraction_cache FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
