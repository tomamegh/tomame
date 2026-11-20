-- Migration 106: a re-paste re-reads a stale link, a failed read is retried
-- once, and no paste reads forever.
--
-- Two columns on the paste queue (049):
--
--   queued_at  — when the customer last asked for this link to be read (a
--                paste, a re-paste, "Read it again"). The screen's "Reading…"
--                clock and the give-up window run from here, not from
--                created_at (an hours-old row re-pasted now is not "stuck") nor
--                from updated_at (bumped by every claim and requeue).
--   not_before — a requeued job the sweep must leave alone until then: the
--                one automatic retry of a read where every tier failed waits
--                ~45 s for a vendor hiccup to pass.
--
-- A `pending` row that still names an extraction is a re-check of a stale read:
-- the old figures stay usable until the job replaces them.
--
-- RLS unchanged: both columns are written by the service role only.

BEGIN;

ALTER TABLE extraction_requests
  ADD COLUMN IF NOT EXISTS queued_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS not_before TIMESTAMPTZ;

COMMENT ON COLUMN extraction_requests.queued_at IS
  '106: when this link was last asked to be read; the Reading clock and the 5-minute give-up run from here.';
COMMENT ON COLUMN extraction_requests.not_before IS
  '106: the sweep leaves a requeued job alone until then (the one retry of a read that found nothing).';

COMMIT;
