-- Migration 068: buying the car.
--
-- WHAT THIS IS. 067 built the catalogue and stopped at the money, on purpose:
-- its header says so in as many words, and names the two questions that were
-- open. Both are now answered, and this migration is the answer written down.
--
--   1. DEPOSIT OR FULL PRE-PAYMENT? Full pre-payment. One car, one charge, paid
--      in full, and there is deliberately no way to express a part payment here.
--      That is not merely a product preference: `assertNoActivePayment` in
--      `src/features/payments/services/payments.service.ts` refuses to open a
--      second transaction against a target that already has a pending or
--      successful one, which is the guard that stops a customer being charged
--      twice for the same thing. A deposit model needs exactly what that guard
--      forbids — several successful payments against one target — so it cannot
--      be bolted on later by relaxing a condition. It would be a different
--      table with its own instalment ledger, and nothing in this file quietly
--      half-permits it. `car_orders.price_pesewas` is THE price, and the
--      payment that settles it carries the whole of it.
--
--   2. WHAT HAPPENS TO THE MONEY WHILE THE VEHICLE IS MID-OCEAN? The same thing
--      that happens to it for every other order in this product: it is ours,
--      the order is `paid`, and the state machine below carries the customer
--      from there to `delivered`. CLAUDE.md: full pre-payment is required
--      before any order processing begins. A car is the largest instance of
--      that rule, not an exception to it.
--
-- WHY A NEW TABLE RATHER THAN `orders`. This was tried on paper and it does not
-- fit, in four places, each of which would have had to be weakened:
--
--   * `cart_items.extraction_cache_id` is NOT NULL. A bag line IS a scraped
--     product snapshot; there is no line-item-kind seam to widen. A car has no
--     extraction to point at.
--   * `orders` requires `product_url`, `product_name` and `estimated_price_usd`,
--     and CHECKs `origin_country IN ('USA','UK','CHINA')`. A car has no URL, no
--     dollar price, and comes overwhelmingly from Japan, Korea or Germany —
--     which is exactly why 067 gave `car_listings` its own country list.
--   * `chargeBlockedReason` gates payability on `isPayablePricing(order.pricing)`,
--     which demands a `PricingBreakdown` struck by `src/lib/pricing/calculator.ts`.
--     A car price is four quotes an admin typed. `src/lib/pricing/payable.ts`'s
--     own doc comment catalogues three bugs caused by synthesising a breakdown
--     that no calculator produced; this path does not add a fourth. It gets its
--     own payability predicate instead.
--   * An `orders` row for a car would sit in the customer's bag, the
--     consolidation boxes and the freight arithmetic, none of which have any
--     meaning for a vehicle on a roll-on/roll-off vessel.
--
-- So: one table, one state machine modelled on `orders`, and one nullable
-- column on `payments` — added exactly the way 048 added `order_group_id`,
-- because a payment's target is the one thing the callback and the webhook both
-- have to read, and a third shape of it belongs beside the other two.
--
-- THE ONE THING THIS MIGRATION GUARANTEES THAT NO SERVICE CAN. A car is a
-- single physical object. Two customers pressing Buy in the same second is not
-- a hypothetical — it is what happens to the one good listing on the site — and
-- a read-then-write in a service cannot settle it, because both requests read
-- "no order yet" before either writes. `uq_car_orders_live` below is the
-- arbiter: the database refuses the second insert, and the service turns that
-- refusal into a 409. Everything else here is bookkeeping around that index.

BEGIN;

-- ── car_orders ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS car_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE RESTRICT, not CASCADE. A listing somebody has paid for is not an
  -- admin's to delete: the cascade would take the record of a five-figure sale
  -- with it and leave a `payments` row pointing at nothing. The delete fails
  -- instead, loudly, which is the correct answer to "delete the car we sold".
  car_listing_id    UUID NOT NULL REFERENCES car_listings(id) ON DELETE RESTRICT,
  -- No ON DELETE clause, matching `payments.user_id` (005): a financial record
  -- keeps its counterparty. Removing a customer who has bought a car is a
  -- decision someone has to make deliberately, not a cascade.
  user_id           UUID NOT NULL REFERENCES profiles(id),

  -- ── The price, snapshotted, and why that word matters ────────────────────
  --
  -- THIS IS THE AGREED PRICE, COPIED AT PURCHASE TIME, AND NOTHING MAY READ IT
  -- OFF THE LISTING AGAIN. `car_listings.price_pesewas` is a live, admin-edited
  -- figure on a public page: a buyer corrects it when a freight quote lands, and
  -- 067 gives repricing its own audit action because it happens. If the charge
  -- re-read the listing, a reprice between "Buy" and the Paystack callback would
  -- settle the customer's order at a number they never agreed to — upward, in
  -- the case that matters. `order_groups.total_pesewas` exists for exactly this
  -- reason and its comment in `groupCharge` says "never re-read from the bag".
  -- Same rule, same words.
  --
  -- INTEGER PESEWAS (GHS x 100), matching `payments.amount` (005),
  -- `order_groups.total_pesewas` (048) and `car_listings.price_pesewas` (067).
  -- CLAUDE.md: payment amounts are in pesewas.
  price_pesewas     INTEGER NOT NULL CHECK (price_pesewas > 0),

  -- Which of 067's three price states this car was bought under, snapshotted
  -- alongside the figure.
  --
  -- 'on_request' IS ABSENT FROM THIS CHECK, AND THAT IS THE POINT. 067's
  -- `car_listings_price_state_has_price` guarantees an `on_request` listing
  -- carries NO price, so "buy it now" against one could only ever mean charging
  -- zero or charging a number nobody quoted. The service refuses it with a 409;
  -- this CHECK is why that refusal cannot be bypassed by any other writer. A
  -- customer who wants one of those cars files a `car_enquiry` and gets a
  -- figure from a person first.
  --
  -- 'negotiable' IS allowed: buying at the asking price is accepting it, which
  -- is a sale and not a negotiation.
  price_state       TEXT NOT NULL CHECK (price_state IN ('fixed', 'negotiable')),

  -- "2019 Toyota Highlander XLE" as it read on the day. Denormalised on
  -- purpose, for the same reason the price is: `car_listings` is editable, and
  -- a receipt that renames itself when an admin corrects a trim level is not a
  -- receipt. Cheap, and it makes the admin queue readable without a join.
  car_label         TEXT NOT NULL CHECK (length(btrim(car_label)) > 0),

  -- ── The state machine ────────────────────────────────────────────────────
  --
  -- Modelled on `orders`, edge for edge:
  --
  --   pending_payment → paid → processing → in_transit → delivered
  --   pending_payment → cancelled            (and from nowhere else)
  --
  -- SPELLED `pending_payment`, NOT `pending`. `orders` says `pending`, which
  -- `src/features/orders/services/order-transitions.ts` records as "this
  -- codebase's spelling of pending_payment". This table is new and has no
  -- legacy spelling to honour, so it uses CLAUDE.md's own word and nobody has
  -- to be told that two names mean one thing.
  --
  -- The edges live once, in `src/features/cars/car-orders.types.ts`, shared by
  -- the service and any console — the arrangement `order-transitions.ts`
  -- exists to create. This CHECK is the set of legal STATES; that table is the
  -- set of legal MOVES between them, and neither substitutes for the other.
  --
  -- `cancelled` is reachable ONLY from `pending_payment`. Once money has
  -- arrived, unwinding a car sale is a refund — a decision with a person in it,
  -- not a status change.
  status            TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                      'pending_payment', 'paid', 'processing', 'in_transit',
                      'delivered', 'cancelled')),

  -- The transaction that settled it. RESTRICT so a payment cannot be deleted
  -- out from under a car somebody owns; in practice nothing deletes payments,
  -- and this is the constraint that keeps it that way.
  payment_id        UUID REFERENCES payments(id) ON DELETE RESTRICT,
  paid_at           TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  -- Why it was released: "payment abandoned", "customer changed their mind".
  -- Read by the next customer's admin, and by us when a car is unexpectedly
  -- back on the market.
  cancel_reason     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Stamped by hand in `src/db/queries/car-orders.ts` on every UPDATE. There is
  -- no shared trigger function in this schema and 067 added none.
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MONEY THAT ARRIVED IS ATTRIBUTED. A row past `pending_payment` and not
-- cancelled was paid for, so it names the payment that did it and the moment it
-- happened. Without this, a settlement that wrote the status but lost the
-- `payment_id` would produce a paid car nobody could tie to a transaction —
-- which is the exact question asked when a customer disputes a charge.
ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_paid_is_attributed;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_paid_is_attributed CHECK (
    status IN ('pending_payment', 'cancelled')
    OR (payment_id IS NOT NULL AND paid_at IS NOT NULL)
  );

-- And a cancellation says when. `cancel_reason` is deliberately not required:
-- the reconciliation sweep that releases an abandoned checkout has a reason,
-- but an admin releasing a car by hand should not be blocked on prose.
ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_cancelled_is_stamped;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_cancelled_is_stamped CHECK (
    status <> 'cancelled' OR cancelled_at IS NOT NULL
  );

-- ── A CAR MAY ONLY BE SOLD ONCE ─────────────────────────────────────────────
--
-- THE INDEX THIS WHOLE MIGRATION IS ABOUT.
--
-- One live order per listing, enforced by the database, because the race is
-- real and a service cannot win it. Two customers press Buy 40 ms apart; both
-- SELECT and both see no order; both INSERT. With this index the second INSERT
-- raises 23505 and `src/db/queries/car-orders.ts` turns it into
-- `CarAlreadySoldError`, which the service answers as a 409. Without it, one
-- vehicle has two owners and two Paystack transactions, and somebody is getting
-- a refund and an apology.
--
-- WIDER THAN "pending_payment OR paid", AND THAT IS DELIBERATE. The obvious
-- version covers only those two states — but a car that has moved on to
-- `processing` or `in_transit` is MORE sold, not less, and under the narrow
-- index a second customer could buy a vehicle already on its way to the first.
-- Everything except `cancelled` is live. `cancelled` is the one state that
-- genuinely releases a car back to the market, which is what makes it the right
-- and only exclusion.
CREATE UNIQUE INDEX IF NOT EXISTS uq_car_orders_live
  ON car_orders (car_listing_id) WHERE status <> 'cancelled';

-- The customer's own list, newest first.
CREATE INDEX IF NOT EXISTS idx_car_orders_user
  ON car_orders (user_id, created_at DESC);
-- The admin queue: what has been paid for and needs working, oldest first.
CREATE INDEX IF NOT EXISTS idx_car_orders_status
  ON car_orders (status, created_at ASC);

ALTER TABLE car_orders ENABLE ROW LEVEL SECURITY;

-- Explicit GRANTs: hosted Supabase grants these on new public tables by default
-- and a local `supabase start` does not (036 explains this at length).
--
-- SELECT ONLY, and no `anon` at all. 061 revoked INSERT/UPDATE/DELETE from the
-- API roles across every app-written table, and this is the most write-sensitive
-- row in the product: a customer who could UPDATE it would set their own order
-- to `paid`. Every write goes through `createAdminClient()` behind the checkout
-- service, which is also where the price is read from `car_listings` rather than
-- from the request.
GRANT SELECT ON car_orders TO authenticated;
GRANT ALL    ON car_orders TO service_role;

-- Policies dropped first so the migration is re-runnable alongside its
-- CREATE TABLE IF NOT EXISTS, exactly as 065 and 067 do.
--
-- A customer reads their own purchase and nobody else's. Somebody else's car
-- order names the price they paid.
DROP POLICY IF EXISTS "car_orders owner read" ON car_orders;
CREATE POLICY "car_orders owner read"
  ON car_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- The house form: policies read `profiles.role`, not the JWT claim, because a
-- policy is evaluated inside the database where the claim is not the thing at
-- hand.
DROP POLICY IF EXISTS "car_orders admin read" ON car_orders;
CREATE POLICY "car_orders admin read"
  ON car_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No INSERT or UPDATE policy for `authenticated`, deliberately and at both
-- levels: the GRANT above withholds the privilege and there is no policy that
-- would have admitted it. A direct PostgREST insert would bypass the published
-- check, the price snapshot, the rate limit and the audit row — i.e. a customer
-- could create a car order for a draft listing at a price of their choosing.

COMMENT ON TABLE car_orders IS
  'One customer buying one car, paid in full up front. Not an orders row: see the migration header for the four places orders does not fit. uq_car_orders_live is what stops a car being sold twice.';
COMMENT ON COLUMN car_orders.price_pesewas IS
  'The agreed price in pesewas, SNAPSHOTTED at purchase. Never re-read from car_listings, which an admin may reprice between Buy and the Paystack callback.';
COMMENT ON COLUMN car_orders.price_state IS
  'fixed | negotiable, as the listing stood. on_request is excluded by CHECK: such a listing carries no price, so buying it could only mean charging a figure nobody quoted.';
COMMENT ON COLUMN car_orders.status IS
  'pending_payment → paid → processing → in_transit → delivered, plus cancelled from pending_payment only. Edges live in src/features/cars/car-orders.types.ts.';

-- ── payments.car_order_id ───────────────────────────────────────────────────
--
-- A third target for a payment, added exactly as 048 added the second.
--
-- WHY A COLUMN AND NOT JUST METADATA. `payments` has no `order_id` column at
-- all — a single-order payment is reachable only through
-- `metadata->>'order_id'`, which is why `findActivePayment` has to reach into
-- JSON for that one case. 048 declined to repeat that for groups and it was
-- right: the double-payment guard, the reconciliation sweep (059) and every
-- admin query join on this. A real, indexed, foreign-keyed column is what makes
-- "has this car order already been charged?" a question the database can
-- answer.
--
-- ON DELETE SET NULL mirrors `order_group_id`. It is unreachable in practice —
-- `car_orders_paid_is_attributed` refuses to let a settled row lose its
-- `payment_id`, and `car_orders.payment_id` is RESTRICT in the other direction
-- — but a nullable orphan beats a cascaded-away payment record if it ever is.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS car_order_id UUID REFERENCES car_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_car_order
  ON payments (car_order_id) WHERE car_order_id IS NOT NULL;

COMMENT ON COLUMN payments.car_order_id IS
  'The car order this payment buys (068). Null for order and order-group payments. The column findActivePayment scopes on, so a second checkout on one car is refused.';

COMMIT;
