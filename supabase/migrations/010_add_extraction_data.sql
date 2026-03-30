-- Migration 010: Add extraction_data JSONB column to orders
-- Stores the full ExtractionResult from the product scraping step.
-- Distinct from extraction_metadata (which holds confidence/source info).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS extraction_data JSONB;
