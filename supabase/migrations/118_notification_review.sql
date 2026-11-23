-- 118: an admin can mark failed and pending sends reviewed (site brief, Fix 8).
--
-- The admin bell counted every failed and pending send as "needing attention"
-- (103 at review) with no way to triage them: an admin is not the recipient,
-- so the customer's read_at does not apply. reviewed_at records that an admin
-- has looked at the row; the attention count is failed + pending not yet
-- reviewed. A row that fails again later is new information and is counted
-- again only if it is a new row (retries update the same row, which stays
-- reviewed).

BEGIN;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  -- No foreign key on purpose: a second notifications -> profiles link makes
  -- every PostgREST embed of the recipient (profiles(...)) ambiguous.
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_attention
  ON notifications (created_at DESC) WHERE status IN ('pending', 'failed') AND reviewed_at IS NULL;

COMMENT ON COLUMN notifications.reviewed_at IS '118: an admin marked this failed/pending send reviewed; it no longer counts as needing attention.';

COMMIT;
