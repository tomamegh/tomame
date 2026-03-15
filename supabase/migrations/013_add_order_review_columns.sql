-- Migration 013: Add review and extraction metadata columns to orders
-- These columns support the admin review workflow and extraction tracking.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_metadata JSONB;
