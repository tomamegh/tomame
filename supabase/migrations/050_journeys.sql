-- Migration 050: journeys — a customer-readable event log, a number the customer
-- can read aloud, and an ETA that is a window rather than a single day.
--
-- WHY order_events AND NOT audit_logs. `audit_logs` (002) is the compliance
-- record: admin-read-only under RLS (002:18-25), machine-worded, append-only, and
-- nothing writes logistics facts into it. The journey detail screen needs the
-- opposite of all four — the CUSTOMER reads it, the wording is human ("Departed
-- Cincinnati hub"), and a hub arrival carries a weight and a place that have no
-- column anywhere today. Two tables, two audiences: audit stays the compliance
-- record, `order_events` becomes the customer narrative. See
-- `docs/redesign-data-map.md` §"Phase 5 specs".
--
-- WHY NO "US hub" STATUS. `ORDER_STATUSES` (src/config/constants.ts:31-38) and
-- `ALLOWED_TRANSITIONS` (orders.service.ts) are untouched by this migration. The
-- five-stop track the mock draws (`v2-detail`, design line 340) is a PRESENTATION
-- over the seven statuses plus this table: "US hub" is "an `order_events` row of
-- kind `hub_received` exists", not an eighth status. Adding one would have meant
-- rewriting the state machine, every email template and the admin console for a
-- dot on a track.

BEGIN;

-- ── orders.order_no — the number a customer reads aloud on WhatsApp ──────────
-- Every mock screen shows `TM-48213`. A UUID prefix is not a substitute: the
-- point of this column is that it survives being spoken down a phone line.
--
-- A SEQUENCE rather than a random string so the numbers are short, never collide,
-- and stay monotonic. `lpad(...,5,'0')` gives TM-00001 … TM-99999 and simply grows
-- a digit after that, which is the right failure mode — nothing breaks at 100k.
CREATE SEQUENCE IF NOT EXISTS order_no_seq AS BIGINT START WITH 1 MINVALUE 1;

-- The DEFAULT below calls nextval() during an INSERT that runs as the CALLER.
-- Order creation uses the cookie-bound client under the "users can insert own
-- orders" policy, so `authenticated` must be able to advance the sequence or
-- every order insert answers 42501. (phase-2 handoff §5.2: new migrations declare
-- their GRANTs explicitly — local Supabase does not replicate hosted defaults.)
GRANT USAGE, SELECT ON SEQUENCE order_no_seq TO authenticated, service_role;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_no TEXT;

-- Backfill, deterministically. `row_number()` over (created_at, id) — NOT
-- nextval() inside an UPDATE ... FROM, whose evaluation order Postgres does not
-- promise, so the oldest order could otherwise be handed the highest number.
-- (created_at, id) is a total order even if two rows share a millisecond, so
-- running this on dev and on prod gives each database the same numbering for its
-- own rows. `WHERE order_no IS NULL` makes a re-run a no-op.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM orders
   WHERE order_no IS NULL
)
UPDATE orders o
   SET order_no = 'TM-' || lpad(ordered.rn::text, 5, '0')
  FROM ordered
 WHERE o.id = ordered.id;

-- Park the sequence past the backfilled block so the next INSERT continues the
-- run instead of colliding with TM-00001. `is_called` is false on an empty table
-- because setval(seq, 1, true) would then skip TM-00001 for no reason.
SELECT setval(
  'order_no_seq',
  GREATEST((SELECT count(*) FROM orders), 1),
  (SELECT count(*) > 0 FROM orders)
);

ALTER TABLE orders
  ALTER COLUMN order_no SET DEFAULT 'TM-' || lpad(nextval('order_no_seq')::text, 5, '0');
-- NOT NULL only after the backfill and the default are both in place: every
-- existing row now has one and every future row gets one without the app asking.
ALTER TABLE orders ALTER COLUMN order_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_no ON orders (order_no);

COMMENT ON COLUMN orders.order_no IS
  'Human order number, TM-00001. Server-assigned from order_no_seq; never accepted from a client.';

-- ── The ETA window ──────────────────────────────────────────────────────────
-- The mock promises "Thu 18 – Sat 20 Sep" (design line 331). Freight does not
-- land on a named day and a single DATE forces the operator to either pick one
-- and be wrong or leave it empty.
--
-- `estimated_delivery_date` STAYS, as the midpoint, because two live readers
-- still take it: src/features/deliveries/components/deliveries-table/columns.tsx
-- and src/lib/email/templates/order-status.ts. Dropping it would have meant
-- changing an email template in a migration about a screen.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS eta_from DATE,
  ADD COLUMN IF NOT EXISTS eta_to   DATE;
ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS eta_from DATE,
  ADD COLUMN IF NOT EXISTS eta_to   DATE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_eta_window_ordered;
ALTER TABLE orders ADD CONSTRAINT orders_eta_window_ordered
  CHECK (eta_from IS NULL OR eta_to IS NULL OR eta_to >= eta_from);
ALTER TABLE order_deliveries DROP CONSTRAINT IF EXISTS order_deliveries_eta_window_ordered;
ALTER TABLE order_deliveries ADD CONSTRAINT order_deliveries_eta_window_ordered
  CHECK (eta_from IS NULL OR eta_to IS NULL OR eta_to >= eta_from);

-- An order that already carries a single date keeps showing exactly that date:
-- a one-day window, not a fabricated spread. Widening it here would have invented
-- days either side that no operator ever entered.
UPDATE orders
   SET eta_from = estimated_delivery_date, eta_to = estimated_delivery_date
 WHERE estimated_delivery_date IS NOT NULL AND eta_from IS NULL AND eta_to IS NULL;
UPDATE order_deliveries
   SET eta_from = estimated_delivery_date, eta_to = estimated_delivery_date
 WHERE estimated_delivery_date IS NOT NULL AND eta_from IS NULL AND eta_to IS NULL;

COMMENT ON COLUMN orders.estimated_delivery_date IS
  'Midpoint of [eta_from, eta_to], kept for the deliveries table and the status email. The window is the source of truth.';

-- ── order_deliveries: the upsert that could never work ──────────────────────
-- `orders.service.ts` upserts with `onConflict: "order_id"`, but 017 gave
-- order_id only a PLAIN index and Postgres requires a UNIQUE one for ON CONFLICT.
-- The error was caught and logged, so carrier and tracking silently failed to
-- reach this table for as long as it has existed (data map §"Existing defects" 1).
-- Phase 5 is the first screen to read the row, so the index lands with it.
DELETE FROM order_deliveries d
 WHERE EXISTS (
   SELECT 1 FROM order_deliveries keep
    WHERE keep.order_id = d.order_id
      AND (keep.updated_at, keep.id) > (d.updated_at, d.id)
 );
DROP INDEX IF EXISTS order_deliveries_order_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_deliveries_order ON order_deliveries (order_id);

-- ── audit_logs: the lookup the journey timeline performs ────────────────────
-- `getOrderAuditLogs` filters on (entity_type, entity_id) and 002 indexed
-- neither. Cheap now, unaffordable later.
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);

-- ── order_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- Denormalised from the order so a future group-level timeline ("your box left
  -- Delaware") can be written once against the group rather than N times.
  order_group_id      UUID REFERENCES order_groups(id) ON DELETE SET NULL,
  -- `cancelled` and `completed` are not in the data map's list but ARE reachable
  -- transitions (ALLOWED_TRANSITIONS: pending→cancelled, delivered→completed), and
  -- the writer records every transition it makes. A kind with no CHECK entry would
  -- fail the status change itself, which is the one thing an event must never do.
  kind                TEXT NOT NULL CHECK (kind IN (
                        'payment_received', 'purchased', 'hub_received', 'departed',
                        'arrived_country', 'out_for_delivery', 'delivered',
                        'completed', 'cancelled', 'note')),
  -- Customer-facing wording, e.g. 'Departed Cincinnati hub'. Never a status code.
  title               TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  -- The second line: 'order 114-3902', 'MTN MoMo', 'Signed by Kwame'.
  detail              TEXT,
  location            TEXT,
  -- The received weight the mock prints next to a hub arrival ("· 0.6 lb").
  weight_lbs          NUMERIC CHECK (weight_lbs IS NULL OR weight_lbs >= 0),
  -- WHEN IT HAPPENED, which is not when the row was written: an operator logging
  -- yesterday's hub arrival this morning must be able to say so. `created_at` keeps
  -- the write time separately.
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON order_events TO authenticated;
GRANT ALL ON order_events TO service_role;

-- Owner reads their own, and ONLY the rows marked visible: an internal note
-- ("seller unresponsive, trying a second listing") must not leak through a
-- SELECT the customer's own session makes.
CREATE POLICY "order_events owner read"
  ON order_events FOR SELECT TO authenticated
  USING (
    is_customer_visible
    AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );

CREATE POLICY "order_events admin read"
  ON order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No INSERT/UPDATE/DELETE policy for `authenticated` on purpose: every write is
-- the server's, through the service role. A customer must never be able to write
-- their own parcel's history.

-- The only query the timeline makes.
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events (order_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_group ON order_events (order_group_id, occurred_at DESC)
  WHERE order_group_id IS NOT NULL;

-- ── Backfill: only from facts that are already stored ───────────────────────
-- Orders that predate this table have a history, and it is recoverable from three
-- real timestamps. Nothing below invents a date: an order with no successful
-- payment, no status-change audit row and no `delivered_at` gets an EMPTY
-- timeline, and the screen says "No updates yet" rather than showing a plausible
-- fiction.

-- 1. Payment. `payments.order_group_id` (048) for a bag, `metadata->>'order_id'`
--    for a legacy single-order payment — the link the TypeScript has always dug out.
INSERT INTO order_events (order_id, order_group_id, kind, title, detail, occurred_at, created_by)
SELECT o.id,
       o.order_group_id,
       'payment_received',
       'Payment received',
       nullif(btrim(coalesce(p.channel, '')), ''),
       p.created_at,
       NULL
  FROM payments p
  JOIN orders o
    ON (p.order_group_id IS NOT NULL AND o.order_group_id = p.order_group_id)
    OR (p.order_group_id IS NULL AND o.id = (p.metadata->>'order_id')::uuid)
 WHERE p.status = 'success'
   AND NOT EXISTS (
     SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'payment_received'
   );

-- 2. Admin status changes already recorded in the compliance log.
INSERT INTO order_events (order_id, order_group_id, kind, title, occurred_at, created_by)
SELECT o.id,
       o.order_group_id,
       CASE a.metadata->>'to'
         WHEN 'processing' THEN 'purchased'
         WHEN 'in_transit' THEN 'departed'
         WHEN 'delivered'  THEN 'delivered'
         WHEN 'completed'  THEN 'completed'
         WHEN 'cancelled'  THEN 'cancelled'
       END,
       CASE a.metadata->>'to'
         WHEN 'processing' THEN 'Our buyer is placing the order'
         WHEN 'in_transit' THEN 'On its way to Accra'
         WHEN 'delivered'  THEN 'Delivered'
         WHEN 'completed'  THEN 'Journey complete'
         WHEN 'cancelled'  THEN 'Order cancelled'
       END,
       a.created_at,
       a.actor_id
  FROM audit_logs a
  JOIN orders o ON o.id = a.entity_id
 WHERE a.entity_type = 'order'
   AND a.action IN ('order_status_changed', 'order_cancelled_by_user')
   AND a.metadata->>'to' IN ('processing', 'in_transit', 'delivered', 'completed', 'cancelled')
   AND NOT EXISTS (
     SELECT 1 FROM order_events e
      WHERE e.order_id = o.id AND e.occurred_at = a.created_at AND e.kind IS NOT NULL
        AND e.title IS NOT NULL AND e.kind = CASE a.metadata->>'to'
          WHEN 'processing' THEN 'purchased'
          WHEN 'in_transit' THEN 'departed'
          WHEN 'delivered'  THEN 'delivered'
          WHEN 'completed'  THEN 'completed'
          WHEN 'cancelled'  THEN 'cancelled'
        END
   );

-- 3. A delivery that was recorded on the order but never in the audit log.
INSERT INTO order_events (order_id, order_group_id, kind, title, occurred_at, created_by)
SELECT o.id, o.order_group_id, 'delivered', 'Delivered', o.delivered_at, NULL
  FROM orders o
 WHERE o.delivered_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.kind = 'delivered');

COMMIT;
