-- Migration 054: the warehouse photo, and what the customer says back.
--
-- Kelvin's brief: "When an item reaches a warehouse, Tomame admin takes a pic
-- and uploads, and as a shopper I see the pic and it updates on the journey
-- page. So in case the item purchased does not match what the customer wants,
-- the customer can share feedback that goes to the admin."
--
-- This is the first point in the product where a customer sees what was actually
-- BOUGHT rather than what they asked for, so it is also the first point where
-- they can catch a mistake while it is still cheap to fix — the parcel is at a
-- US hub, not in the air. The feedback half is the important half; the photo
-- alone is just a picture.
--
-- WHY A TABLE AND NOT A COLUMN ON order_events. An arrival produces SEVERAL
-- photos (front, label, the damaged corner), and they outlive the event row that
-- prompted them — a photo is evidence in a dispute three weeks later, when the
-- timeline has moved on. `order_events` (050) stays the narrative; this is the
-- attachment store the narrative joins to. `event_id` is nullable and
-- ON DELETE SET NULL for exactly that reason: losing the event must not lose the
-- evidence.
--
-- WHY order_feedback IS NOT assisted_requests. `assisted_requests` (049) is a
-- PRE-purchase escape hatch — "we could not read this page, describe it for us".
-- This is post-purchase, about a parcel we have already bought and are holding.
-- Same queue SHAPE (a guarded from → to status transition so two staff cannot
-- claim one item, and a badge fed by `getAdminQueueCounts`), different lane.
--
-- DOES AN OBJECTION STOP THE PARCEL? Kelvin's decision: an admin decides, per
-- case. Feedback never pauses anything on its own — a customer cannot halt their
-- own shipment by typing, which would be an obvious lever to pull — but the
-- queue gets a hold action, and a held order refuses to advance. The hold is
-- three columns on `orders` and NOT an eighth status: `ORDER_STATUSES` and
-- `ALLOWED_TRANSITIONS` are untouched, exactly as 050 refused to add "US hub".
-- A status is where the parcel IS; a hold is whether it may move.

BEGIN;

-- ── The bucket ──────────────────────────────────────────────────────────────
-- Separate from `marketing-media` (040). That bucket is also private, so this is
-- not about public-vs-private — it is about lifecycle and blast radius. Marketing
-- images are company assets an admin replaces at will; these are photographs of
-- one named customer's property, they are evidence in disputes, and they will one
-- day need a retention rule that marketing images must not inherit. One `delete
-- from storage.objects where bucket_id = 'marketing-media'` should never be able
-- to take a customer's parcel photos with it.
--
-- Private, like marketing-media: nothing reads it directly. The bytes are served
-- by an authenticated route that re-checks ownership per request, so a leaked
-- URL is not a leaked photo.
INSERT INTO storage.buckets (id, name, public)
VALUES ('parcel-photos', 'parcel-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ── order_photos ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_photos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- The timeline entry this photo was taken for, when there is one. Nullable and
  -- SET NULL: the evidence outlives the narrative (see the header).
  event_id       UUID REFERENCES order_events(id) ON DELETE SET NULL,
  -- Where in the journey the picture was taken. Deliberately a small vocabulary
  -- rather than free text: it decides which heading the photo appears under on
  -- the customer's screen, and a typo would file it nowhere.
  kind           TEXT NOT NULL DEFAULT 'hub_received'
                   CHECK (kind IN ('hub_received', 'packed', 'damaged', 'delivered', 'other')),
  -- An object key inside `parcel-photos`: "orders/<uuid>/<random>.webp".
  -- No scheme, no host, no "..", no leading slash — the same shape rule 040
  -- applies to marketing uploads, for the same reason: a row must not be able to
  -- point at a third party or climb out of its own prefix.
  storage_path   TEXT NOT NULL
                   CHECK (storage_path ~ '^orders/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  -- Measured server-side by sharp AFTER re-encoding, never taken from the
  -- upload — the same guarantee 040 makes. WebP only, for the same reason: the
  -- re-encode is what proves the bytes are really an image and not a polyglot.
  content_type   TEXT NOT NULL DEFAULT 'image/webp' CHECK (content_type = 'image/webp'),
  width          INT  NOT NULL CHECK (width  > 0),
  height         INT  NOT NULL CHECK (height > 0),
  byte_size      INT  NOT NULL CHECK (byte_size > 0),
  -- The admin's own words next to the picture: "Front of box, seal intact".
  caption        TEXT,
  -- An internal photo an operator wants on file without showing the customer —
  -- the same door `order_events.is_customer_visible` opens, and closed the same
  -- way in the owner's SELECT policy below.
  is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  taken_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_photos ENABLE ROW LEVEL SECURITY;
-- Explicit GRANTs: hosted Supabase grants these on new public tables by default
-- and a local `supabase start` does not (036 explains this at length).
GRANT SELECT ON order_photos TO authenticated;
GRANT ALL ON order_photos TO service_role;

CREATE POLICY "order_photos owner read"
  ON order_photos FOR SELECT TO authenticated
  USING (
    is_customer_visible
    AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );

CREATE POLICY "order_photos admin read"
  ON order_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No INSERT/UPDATE/DELETE policy for `authenticated`, on the same principle 050
-- states: a customer must never write their own parcel's history, and that
-- includes its photographs. Every write is the server's, through the service role.

-- The only query the journey screen makes, and the newest picture first.
CREATE INDEX IF NOT EXISTS idx_order_photos_order ON order_photos (order_id, taken_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_photos_storage_path ON order_photos (storage_path);

COMMENT ON TABLE order_photos IS
  'Warehouse photographs of a customer parcel. Private bucket; served only through an authenticated route that re-checks ownership.';

-- ── order_feedback ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- The photo being objected to, when the customer is objecting to one. Null for
  -- feedback about the order in general. SET NULL rather than CASCADE: deleting a
  -- photo must not silently delete the complaint about it.
  photo_id      UUID REFERENCES order_photos(id) ON DELETE SET NULL,
  -- Who said it. NOT NULL: unlike `contact_messages` (053), which routinely comes
  -- from a signed-out visitor, this is always a customer talking about an order
  -- they own, and that ownership is the authorization.
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- What kind of problem, so the queue can be triaged without reading every row.
  -- 'looks_right' is here on purpose: a customer confirming the photo is correct
  -- is the single most useful signal this feature can produce, and a table that
  -- only accepts complaints would throw it away.
  verdict       TEXT NOT NULL
                  CHECK (verdict IN ('looks_right', 'wrong_item', 'wrong_variant', 'damaged', 'other')),
  message       TEXT NOT NULL CHECK (length(btrim(message)) > 0),
  -- The queue's guarded transition, same shape as assisted_requests (049) and
  -- contact_messages (053): a service claims 'open' → 'in_review' so two staff
  -- cannot work one row, and resolves to 'resolved' or 'dismissed'.
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  handled_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution    TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_feedback ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON order_feedback TO authenticated;
GRANT ALL ON order_feedback TO service_role;

-- The customer reads what they said and how it was resolved — the loop is
-- pointless if the answer never reaches them.
CREATE POLICY "order_feedback owner read"
  ON order_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "order_feedback admin read"
  ON order_feedback FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No client INSERT policy even though this IS the customer's own words: the
-- route writes it with the service role after checking that the order is theirs,
-- which is also where the rate limit and the validation live. A direct PostgREST
-- insert would bypass both and could set `status` or `handled_by` by hand.

-- Oldest open first: someone is waiting, and they are waiting on a parcel that
-- is still movable.
CREATE INDEX IF NOT EXISTS idx_order_feedback_queue ON order_feedback (status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_feedback_order ON order_feedback (order_id, created_at DESC);

COMMENT ON TABLE order_feedback IS
  'What a customer says about a parcel photo. Post-purchase; assisted_requests (049) is the pre-purchase lane.';

-- ── The hold ────────────────────────────────────────────────────────────────
-- NOT a status. `ORDER_STATUSES` and `ALLOWED_TRANSITIONS` are untouched — a
-- status says where the parcel is, and a hold says whether it may move. Adding
-- an eighth status would have meant rewriting the state machine, every email
-- template, the journey track and the admin console for a flag.
--
-- `updateOrderStatusAdmin` refuses to advance an order with `held_at` set. That
-- check is app-side rather than a CHECK constraint because it is a rule about a
-- TRANSITION, and a constraint can only see the row it is writing.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS held_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS held_by     UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- A hold without a reason is a parcel that stops for reasons nobody recorded —
-- the customer asks why and there is no answer. Both or neither.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_hold_has_reason;
ALTER TABLE orders ADD CONSTRAINT orders_hold_has_reason
  CHECK (held_at IS NULL OR length(btrim(coalesce(hold_reason, ''))) > 0);

COMMENT ON COLUMN orders.held_at IS
  'Set by an admin to stop this order advancing. Not a status: ALLOWED_TRANSITIONS is unchanged; updateOrderStatusAdmin refuses to move a held order.';

-- The admin queue asks "what is held right now", and only a handful ever are.
CREATE INDEX IF NOT EXISTS idx_orders_held ON orders (held_at) WHERE held_at IS NOT NULL;

COMMIT;
