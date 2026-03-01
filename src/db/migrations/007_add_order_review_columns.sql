-- Migration 007: Add order review columns for product extraction & admin review flow
-- When extraction fails for any field, orders are flagged needs_review for admin verification.

ALTER TABLE orders
  ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN review_reasons TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN reviewed_by UUID REFERENCES users(id),
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN extraction_metadata JSONB;
