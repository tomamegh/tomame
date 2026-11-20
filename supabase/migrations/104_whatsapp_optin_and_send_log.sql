-- Migration 104: WhatsApp opt-in per checkout, failed-send follow-up, and the
-- staff "WhatsApp sent" log (WhatsApp & tracking brief, 2026-11-20).
--
-- THE OPT-IN. Checkout asks "Send me WhatsApp updates about my order". The
-- answer is stored on the group and on each of its orders. NULL means the order
-- predates this migration (or came from a flow with no tick): the account-level
-- `profiles.whatsapp_opt_in` decides, as before. FALSE means no automated
-- WhatsApp for that order, whatever the profile says. TRUE is consent for that
-- order's updates.
--
-- THE FOLLOW-UP FLAG. When an automated send for an opted-in order fails (Meta
-- refused it, no usable number), the order is stamped so staff message the
-- customer by hand the same day. Cleared when staff record a manual send.
--
-- PHASE 1 SENDS. Until the Meta templates are approved, staff send each stage
-- update themselves from the admin order view (wa.me with the stage's template
-- filled in) and tick "WhatsApp sent". One row per order and stage; who and
-- when are kept, and the API writes an `audit_logs` row for each tick.
--
-- STAGE NAMES. The customer-facing stage titles become the brief's exact names
-- (`src/config/tracking-copy.ts`). Internal keys are unchanged.

BEGIN;

-- ── Opt-in ──────────────────────────────────────────────────────────────────
ALTER TABLE order_groups
  ADD COLUMN IF NOT EXISTS whatsapp_updates BOOLEAN;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS whatsapp_updates       BOOLEAN,
  ADD COLUMN IF NOT EXISTS whatsapp_failed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_failed_reason TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_whatsapp_failed_reason_length;
ALTER TABLE orders ADD CONSTRAINT orders_whatsapp_failed_reason_length
  CHECK (whatsapp_failed_reason IS NULL OR length(whatsapp_failed_reason) <= 300);

COMMENT ON COLUMN orders.whatsapp_updates IS
  '104: the checkout tick. NULL = pre-104, the profile opt-in decides; FALSE = no automated WhatsApp.';
COMMENT ON COLUMN orders.whatsapp_failed_at IS
  '104: an automated WhatsApp for this opted-in order failed. Staff follow up by hand the same day.';

-- Staff's "follow up today" list.
CREATE INDEX IF NOT EXISTS idx_orders_whatsapp_failed
  ON orders (whatsapp_failed_at DESC) WHERE whatsapp_failed_at IS NOT NULL;

-- ── Staff send log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_whatsapp_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL CHECK (stage IN (
                 'paid', 'purchased', 'hub_received', 'departed', 'arrived_country',
                 'ghana_warehouse', 'ready_for_pickup', 'out_for_delivery', 'delivered')),
  template_key TEXT NOT NULL CHECK (length(btrim(template_key)) BETWEEN 1 AND 60),
  sent_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, stage)
);

-- Server-only, like shipment_stage_settings (098): staff reach it through
-- /api/admin/* on the service role, customers never read it.
ALTER TABLE order_whatsapp_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_whatsapp_sends FROM anon, authenticated;
GRANT ALL ON order_whatsapp_sends TO service_role;

CREATE INDEX IF NOT EXISTS idx_order_whatsapp_sends_order
  ON order_whatsapp_sends (order_id, sent_at DESC);

-- ── Customer stage names ────────────────────────────────────────────────────
UPDATE shipment_stage_settings SET title = 'Paid — order confirmed',     updated_at = now() WHERE stage = 'paid';
UPDATE shipment_stage_settings SET title = 'Purchased from the store',   updated_at = now() WHERE stage = 'purchased';
UPDATE shipment_stage_settings SET title = 'Arrived at our US hub',      updated_at = now() WHERE stage = 'hub_received';
UPDATE shipment_stage_settings SET title = 'In flight to Accra',         updated_at = now() WHERE stage = 'departed';
UPDATE shipment_stage_settings SET title = 'Arrived in Accra — cleared', updated_at = now() WHERE stage IN ('arrived_country', 'ghana_warehouse');
UPDATE shipment_stage_settings SET title = 'Out for delivery',           updated_at = now() WHERE stage = 'out_for_delivery';
UPDATE shipment_stage_settings SET title = 'Delivered',                  updated_at = now() WHERE stage = 'delivered';
-- "Cleared" must be true of the words under it: customs is inside freight.
UPDATE shipment_stage_settings
   SET description = 'Landed in Accra. Customs and clearance are included in your freight, so there is nothing to pay.',
       updated_at = now()
 WHERE stage = 'arrived_country' AND description = 'Landed and clearing customs.';

COMMIT;
