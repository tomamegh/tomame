-- Migration 087: staff hear about orders and payments by email.
--
-- WHY. The owner wants the team told whenever a customer places an order,
-- pays (or fails to), and as the order moves (processing, in transit,
-- delivered, cancelled, review outcome). 083 already built the shape for
-- "email a list of people about something the platform did": a private,
-- admin-editable `site_settings` list and a sends table that is the throttle
-- and the record. This reuses that shape for order events rather than adding a
-- second notification system.
--
--   1. `site_settings.staff_order_alert_recipients` (private): who gets them.
--   2. `site_settings.staff_order_alert_events` (private): which event types
--      are on. Every type on by default; a key missing from the object is on.
--   3. `staff_alert_sends`: one row per event, keyed by `event_key`
--      ("payment_succeeded:<payment id>", "order_status:<order id>:delivered").
--      The UNIQUE key is the idempotency: the Paystack webhook and the browser
--      verify can both reach "paid", and only the caller whose INSERT lands
--      sends. Status follows the notifications machine,
--      pending → sent | failed (after 3 attempts), plus `skipped` for a
--      deployment that evaluates but does not send (dev, local).
--
-- Both settings rows are is_public = false: anon's read policy (036) is
-- USING (is_public), so no visitor can list staff addresses. Admins edit them
-- on /admin/notifications through /api/admin/staff-alerts.

-- ── 1 + 2. Settings ─────────────────────────────────────────────────────────
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('staff_order_alert_recipients',
   '["albert.ahadjie@outlook.com", "benjaminbennin@yahoo.com", "kelanimdev@gmail.com"]'::jsonb,
   'Staff order alert recipients',
   'Email addresses told about new orders, payments and order status changes. A list of addresses, for example ["ops@example.com"]. Edited on the Notifications screen.',
   false),
  ('staff_order_alert_events',
   '{"order_placed": true, "payment_succeeded": true, "payment_failed": true, "order_status_changed": true, "order_review": true, "car_order": true}'::jsonb,
   'Staff order alert events',
   'Which events email the staff list. An object of event type to true or false; a type left out is on. Edited on the Notifications screen.',
   false)
ON CONFLICT (key) DO NOTHING;

-- ── 3. One row per event ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_alert_sends (
  id                BIGSERIAL PRIMARY KEY,
  event_key         TEXT NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'order_placed', 'payment_succeeded', 'payment_failed',
                      'order_status_changed', 'order_review', 'car_order', 'test')),
  entity_type       TEXT NOT NULL,
  entity_id         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  subject           TEXT,
  recipients        INTEGER NOT NULL DEFAULT 0,
  failed_recipients INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

-- The idempotency guarantee, enforced by the database rather than by a
-- read-then-write.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_alert_sends_event_key ON staff_alert_sends (event_key);
CREATE INDEX IF NOT EXISTS idx_staff_alert_sends_created ON staff_alert_sends (created_at DESC);

ALTER TABLE staff_alert_sends ENABLE ROW LEVEL SECURITY;
-- Server-only, like ops_alert_sends: no client role may read or write it. The
-- admin screen reads it with the service role after its own admin check.
GRANT ALL ON staff_alert_sends TO service_role;
GRANT USAGE, SELECT ON SEQUENCE staff_alert_sends_id_seq TO service_role;

-- ── Retention ───────────────────────────────────────────────────────────────
-- 90 days, the same as ops_alert_sends. Older keys can never be hit again: an
-- event key names a payment or an order transition that already happened.
SELECT cron.unschedule('cleanup-staff-alert-sends')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-staff-alert-sends');
SELECT cron.schedule('cleanup-staff-alert-sends', '55 3 * * *', $$
  DELETE FROM staff_alert_sends WHERE created_at < now() - interval '90 days';
$$);
