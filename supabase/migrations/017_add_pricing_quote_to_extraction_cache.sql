-- Migration 017: Add pricing_quote column to extraction_cache
-- Stores a locked-in pricing breakdown alongside the scraped product data.
-- The quote is valid for 24 hours from generation, independent of the
-- 5-hour extraction cache TTL.

ALTER TABLE extraction_cache
  ADD COLUMN pricing_quote JSONB DEFAULT NULL;

-- Allow users to update their own cache rows (needed for adding quote after extraction)
CREATE POLICY "Users can update own extraction cache"
  ON extraction_cache FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
