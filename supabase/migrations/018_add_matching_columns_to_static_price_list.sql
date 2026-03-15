-- Migration 018: Add keyword and SKU matching columns to static_price_list
-- Enables automatic matching of scraped products to fixed freight prices
-- using a combination of keywords (from product title) and SKU/ASIN identifiers.

-- Keywords for fuzzy title matching (e.g. ["iphone", "17", "pro"] )
ALTER TABLE static_price_list
  ADD COLUMN keywords TEXT[] NOT NULL DEFAULT '{}';

-- Known SKUs/ASINs that map directly to this price entry
ALTER TABLE static_price_list
  ADD COLUMN skus TEXT[] NOT NULL DEFAULT '{}';

-- Index for GIN array lookups on keywords and skus
CREATE INDEX idx_static_price_keywords ON static_price_list USING GIN (keywords);
CREATE INDEX idx_static_price_skus ON static_price_list USING GIN (skus);
