-- Migration 069: a deposit reserves the car, and the agreed figure is the price.
--
-- TWO CHANGES OF MIND, BOTH WRITTEN DOWN HERE BECAUSE 068 ARGUED THE OPPOSITE AT
-- LENGTH AND A READER WHO FINDS ONLY THAT FILE WILL BELIEVE IT.
--
-- ── 1. THE DEPOSIT (this REVERSES 068's "full pre-payment, no deposits") ─────
--
-- 068's header says "One car, one charge, paid in full, and there is
-- deliberately no way to express a part payment here." That was decided on the
-- shape of the code — `assertNoActivePayment` refuses a second live transaction
-- against one target — and not on the shape of the money. Kelvin, 2026-09-16:
-- Ghanaian Mobile Money wallets carry per-transaction and daily ceilings far
-- below a six-figure vehicle, so a single Paystack charge for GH₵258,000 is not
-- merely unusual, it is very likely IMPOSSIBLE for the customer to complete. A
-- purchase path nobody can finish is not a purchase path.
--
-- WHAT REPLACES IT, AND WHY `assertNoActivePayment` IS UNTOUCHED:
--
--   * ONE Paystack charge, for a DEPOSIT (`deposit_pesewas`). One charge, one
--     target, one live payment — exactly the shape that guard was written for.
--     It is not relaxed, not widened for cars, not special-cased. The thing 068
--     feared (several successful payments against one `car_orders` row) is still
--     impossible and still refused.
--   * The BALANCE is settled OFFLINE — bank transfer, or cash to a person — and
--     an ADMIN records it through `/api/admin/cars/orders/:id`. There is no
--     second Paystack transaction, so no second payment row competes for the
--     guard. `balance_amount_pesewas`, `balance_recorded_by` and `paid_at` are
--     the record that it happened, who says so, and when.
--   * `paid` THEREFORE NOW MEANS FULLY PAID, and a new state sits before it:
--
--         pending_payment → deposit_paid → paid → processing → in_transit → delivered
--         pending_payment → cancelled                        (and from nowhere else)
--
--     A car whose deposit has landed is `deposit_paid`: reserved, committed,
--     money taken, and not yet fully paid for. The vehicle is NOT released
--     between the two — see the note on `uq_car_orders_live` below, which is the
--     single most important line in this file.
--
-- THE DEPOSIT PERCENTAGE IS AN ADMIN SETTING, DEFAULT 30, AND THE RESULT IS
-- SNAPSHOTTED ON THE ROW. `car_deposit_percent` is seeded into `site_settings`
-- at the bottom of this file beside `payment_expiry_minutes`. It is read once,
-- at checkout, and the PESEWA FIGURE it produced is stored — never the intention
-- to recompute it later. An admin moving the dial to 50% next month must not
-- silently raise what a customer who checked out in September owes, and must not
-- change what the balance on an order already settled is.
--
-- ── 2. THE AGREED PRICE (a live production defect, fixed here) ───────────────
--
-- 067 gave a customer two ways to agree a figure with a person: a
-- `price_request` on an `on_request` car, answered with `quoted_pesewas`, and an
-- `offer` on a negotiable one, which an admin may `accept`. 068 then priced
-- checkout from `car_listings.price_pesewas` alone and never looked at
-- `car_enquiries` at all. Two defects follow, and both are live right now:
--
--   * AN `on_request` CAR IS UNBUYABLE EVEN AFTER IT IS QUOTED. On production
--     today a Mercedes E300 has been quoted at GH₵120,000 to a customer who has
--     no way to pay it: the listing still carries no public price, so every
--     purchase check refuses it.
--   * AN ACCEPTED OFFER WOULD OVERCHARGE. Accepting GH₵164,500 on a GH₵212,000
--     car and then charging the asking price is taking GH₵47,500 the customer
--     never agreed to. That is the worst class of bug this table can carry.
--
-- The fix is a rule, not a column: THE CUSTOMER'S OWN AGREED FIGURE IS THAT
-- CUSTOMER'S PRICE, and the listing's figure is what everyone else pays. Agreed
-- means one of exactly two things, and nothing else counts:
--
--   * a `price_request` that is `answered` and carries `quoted_pesewas`; or
--   * an `offer` that is `accepted` — the agreed amount being `offer_pesewas`,
--     what THEY said, not `quoted_pesewas`, which is what we countered with. A
--     counter is an answer, not an acceptance, and charging it would be charging
--     a number the customer never said yes to.
--
-- IT STAYS PRIVATE TO THAT CUSTOMER, which is the whole reason it lives on
-- `car_enquiries` and is not published onto the listing. Two buyers may be
-- quoted differently for the same vehicle — that is what negotiating is — and
-- `car_enquiries owner read` (067) already says one customer never sees
-- another's figure. The price is resolved SERVER-SIDE from the session's user
-- id; the browser still sends a listing id and nothing else.
--
-- WHERE IT CAME FROM IS RECORDED ON THE ORDER (`price_source`, `car_enquiry_id`)
-- so a dispute is settled by reading one row: this customer paid GH₵164,500
-- because THIS offer of theirs was accepted. No join, no reconstruction from
-- timestamps, no inference from a listing that has since been repriced.

BEGIN;

-- ── The agreed price: where the figure came from ────────────────────────────

-- 'listing'        — the public asking price, as 068 did it. The default, and
--                    what every row written before today is.
-- 'quote'          — an admin answered this customer's price request with
--                    `car_enquiries.quoted_pesewas`.
-- 'accepted_offer' — an admin accepted this customer's offer; the figure is
--                    their `offer_pesewas`.
--
-- TEXT + CHECK rather than an enum, as everywhere else in this schema: a new
-- source is one migration, not an ALTER TYPE that cannot run in a transaction
-- alongside its own use.
ALTER TABLE car_orders
  ADD COLUMN IF NOT EXISTS price_source TEXT NOT NULL DEFAULT 'listing';
ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_price_source;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_price_source
  CHECK (price_source IN ('listing', 'quote', 'accepted_offer'));

-- The enquiry the figure was read from, when it was read from one.
--
-- ON DELETE RESTRICT, not SET NULL, and deliberately unlike
-- `car_enquiries.answered_by`. This row IS the evidence for a five-figure price
-- that is not the advertised one; a delete that quietly detached it would leave
-- an order claiming a private quote with nothing behind it, which is precisely
-- the state a dispute cannot be resolved from. Nothing in the product deletes an
-- enquiry, and this is what keeps it that way. (A listing delete cascades to its
-- enquiries — but `car_orders.car_listing_id` is already RESTRICT, so a listing
-- with a sale on it cannot be deleted in the first place.)
ALTER TABLE car_orders
  ADD COLUMN IF NOT EXISTS car_enquiry_id UUID REFERENCES car_enquiries(id) ON DELETE RESTRICT;

-- A private price NAMES ITS EVIDENCE, AND A LISTING PRICE HAS NONE.
--
-- Written as a biconditional on purpose. Half of it stops an order claiming
-- `quote` while pointing at nothing — a number an admin would have to take on
-- trust. The other half stops an order claiming the ASKING price while pointing
-- at an enquiry, which reads as though a negotiation produced a figure it did
-- not.
ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_private_price_is_evidenced;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_private_price_is_evidenced CHECK (
    (price_source = 'listing') = (car_enquiry_id IS NULL)
  );

-- ── price_state: the CHECK 068 wrote too narrow ─────────────────────────────
--
-- WIDENED TO ADMIT 'on_request', DELIBERATELY, AND HERE IS THE ARGUMENT.
--
-- 068 wrote `CHECK (price_state IN ('fixed','negotiable'))` and its comment
-- said: "'on_request' IS ABSENT FROM THIS CHECK, AND THAT IS THE POINT ... such
-- a listing carries NO price, so 'buy it now' against one could only mean
-- charging zero or charging a number nobody quoted."
--
-- The reasoning was right about the danger and wrong about the shape. What must
-- never happen is a car bought at a price NOBODY NAMED. Banning the state banned
-- something else as well: a car bought at a price a person DID name, privately,
-- to this customer — which is exactly what `car_enquiries.quoted_pesewas` is,
-- and exactly what an `on_request` listing exists to produce. Under the old
-- CHECK the quoted Mercedes on production cannot be represented at all, so it
-- cannot be sold.
--
-- The real invariant is the one below: an `on_request` car may be bought, but
-- NEVER at the listing's price, because it has none. `price_source` carries it,
-- and a widened state with that guard is strictly stronger than the ban was —
-- it also rules out a `fixed` listing being bought from a `listing` price that
-- is missing, which the old CHECK said nothing about.
-- Dropped by PATTERN, not by name. An inline column CHECK is auto-named
-- `car_orders_price_state_check` by Postgres — unless a re-run of 068 ever
-- produced `..._check1`, in which case dropping only the exact name would leave
-- the old narrow constraint in place and this migration would apply cleanly and
-- change nothing, until the first quoted car failed to insert at runtime.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'car_orders'::regclass
      AND contype = 'c'
      AND conname LIKE 'car\_orders\_price\_state\_check%'
  LOOP
    EXECUTE format('ALTER TABLE car_orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_price_state_check
  CHECK (price_state IN ('fixed', 'negotiable', 'on_request'));

ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_on_request_is_quoted;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_on_request_is_quoted CHECK (
    price_state <> 'on_request' OR price_source <> 'listing'
  );

-- ── The deposit ─────────────────────────────────────────────────────────────

-- What Paystack was asked for, in pesewas, snapshotted at checkout.
--
-- Added nullable, backfilled, then made NOT NULL: every row that exists today
-- was bought under 068's full-payment model, so its deposit WAS its price. That
-- backfill is not a convenience — a `deposit_pesewas` of NULL or zero on a
-- settled order would make the balance arithmetic below claim the customer still
-- owes the whole car.
ALTER TABLE car_orders ADD COLUMN IF NOT EXISTS deposit_pesewas INTEGER;
UPDATE car_orders SET deposit_pesewas = price_pesewas WHERE deposit_pesewas IS NULL;
ALTER TABLE car_orders ALTER COLUMN deposit_pesewas SET NOT NULL;

-- The percentage that produced it, whole numbers only.
--
-- The FIGURE above is what governs the charge; this is the record of how it was
-- arrived at, which is what makes "why was I asked for GH₵77,400?" answerable a
-- year later after the setting has moved. 100 is the backfill value and it is
-- the truth about every pre-069 row: they were charged the lot.
ALTER TABLE car_orders ADD COLUMN IF NOT EXISTS deposit_percent INTEGER;
UPDATE car_orders SET deposit_percent = 100 WHERE deposit_percent IS NULL;
ALTER TABLE car_orders ALTER COLUMN deposit_percent SET NOT NULL;
ALTER TABLE car_orders ALTER COLUMN deposit_percent SET DEFAULT 100;

ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_deposit_is_sane;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_deposit_is_sane CHECK (
    deposit_pesewas > 0
    AND deposit_pesewas <= price_pesewas
    AND deposit_percent BETWEEN 1 AND 100
  );

-- WHAT REMAINS, COMPUTED BY THE DATABASE AND NOT BY ANYBODY ELSE.
--
-- A stored generated column rather than a third written number, because the one
-- failure mode of storing it is the one that matters: a price corrected, or a
-- deposit rewritten, leaving a stale balance that an admin then collects. Here
-- the arithmetic cannot disagree with its inputs, and no writer can set it.
-- Zero is legitimate and means fully paid by the deposit alone — a 100%
-- setting, or any pre-069 row.
ALTER TABLE car_orders
  ADD COLUMN IF NOT EXISTS balance_pesewas INTEGER
  GENERATED ALWAYS AS (price_pesewas - deposit_pesewas) STORED;

-- ── The new state, and the stamps each one owes ─────────────────────────────

-- By pattern, for the reason given at `price_state` above: a CHECK left behind
-- under a different auto-name would refuse every `deposit_paid` row at runtime
-- while this migration reported success.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'car_orders'::regclass
      AND contype = 'c'
      AND conname LIKE 'car\_orders\_status\_check%'
  LOOP
    EXECUTE format('ALTER TABLE car_orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_status_check CHECK (status IN (
    'pending_payment', 'deposit_paid', 'paid', 'processing', 'in_transit',
    'delivered', 'cancelled'));

-- When the Paystack deposit landed. Distinct from `paid_at`, which now means
-- "fully paid", and backfilled from it: a pre-069 `paid` row's single charge was
-- both events at once.
ALTER TABLE car_orders ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;
UPDATE car_orders SET deposit_paid_at = paid_at
  WHERE deposit_paid_at IS NULL AND paid_at IS NOT NULL;

-- Who recorded the offline balance, what figure they recorded, and any note
-- about how it arrived ("MTN transfer, ref 88213", "cash at the yard").
--
-- `balance_recorded_by` is ON DELETE SET NULL like `car_enquiries.answered_by`:
-- an admin leaving the company must not be undeletable because they once
-- receipted a car, and the amount — the part that is money — survives them.
ALTER TABLE car_orders ADD COLUMN IF NOT EXISTS balance_amount_pesewas INTEGER;
ALTER TABLE car_orders ADD COLUMN IF NOT EXISTS balance_note TEXT;
ALTER TABLE car_orders
  ADD COLUMN IF NOT EXISTS balance_recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- MONEY THAT ARRIVED IS STILL ATTRIBUTED — 068's rule, moved down one state.
--
-- It used to read `status IN ('pending_payment','cancelled') OR (payment_id IS
-- NOT NULL AND paid_at IS NOT NULL)`. `deposit_paid` now carries the payment, so
-- the attribution it demands is the DEPOSIT's: a row anywhere past
-- `pending_payment` names the transaction that reserved the car and the moment
-- it settled. Without this, a settlement that wrote the status and lost the
-- `payment_id` would produce a reserved car nobody could tie to a charge, which
-- is the exact question asked when a customer disputes one.
ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_paid_is_attributed;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_paid_is_attributed CHECK (
    status IN ('pending_payment', 'cancelled')
    OR (payment_id IS NOT NULL AND deposit_paid_at IS NOT NULL)
  );

-- AND FULLY PAID SAYS WHEN AND HOW MUCH.
--
-- `paid` and everything after it mean the balance is in. Either it was recorded
-- (an amount, and the timestamp `paid_at`) or there was never a balance to
-- record because the deposit was the whole price. Both are stated rather than
-- inferred, so "this car is paid for" is never a status somebody typed.
ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_settled_is_receipted;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_settled_is_receipted CHECK (
    status IN ('pending_payment', 'deposit_paid', 'cancelled')
    OR (paid_at IS NOT NULL
        AND (deposit_pesewas = price_pesewas OR balance_amount_pesewas IS NOT NULL))
  );
-- Written against the BASE columns rather than against `balance_pesewas`, which
-- says the same thing (`balance_pesewas` is `price - deposit` by construction).
-- A CHECK that leans on a generated column is one more dependency between two
-- features of the same ALTER, and there is nothing to gain by taking it.

-- A recorded balance carries its figure. The recorder may be nulled by a profile
-- delete (above); the AMOUNT may not, because it is the money.
ALTER TABLE car_orders DROP CONSTRAINT IF EXISTS car_orders_balance_has_an_amount;
ALTER TABLE car_orders
  ADD CONSTRAINT car_orders_balance_has_an_amount CHECK (
    balance_amount_pesewas IS NULL OR balance_amount_pesewas > 0
  );

-- ── uq_car_orders_live: CHECKED, AND IT STILL HOLDS THE CAR ─────────────────
--
-- The index is `ON car_orders (car_listing_id) WHERE status <> 'cancelled'`, so
-- it covers every status that is not `cancelled` — including `deposit_paid`, a
-- state that did not exist when it was written. Nothing needs changing and
-- nothing is changed here; it is restated only so the fact is on the record next
-- to the migration that added the state.
--
-- THIS IS THE LINE THAT MATTERS MOST IN THE WHOLE DEPOSIT MODEL. A customer who
-- has paid GH₵77,400 to reserve a vehicle holds that vehicle. If the index had
-- been written as `status IN ('pending_payment','paid')` — the narrow version
-- 068's header explicitly rejected — `deposit_paid` would have fallen outside it
-- and the car would have gone back on sale the moment the deposit landed. It was
-- written wide precisely so a state added later could not do that.
CREATE UNIQUE INDEX IF NOT EXISTS uq_car_orders_live
  ON car_orders (car_listing_id) WHERE status <> 'cancelled';

-- The admin queue reads by status; `deposit_paid` is now the bucket somebody
-- works from (these are the customers owing a balance), so keep that a range
-- scan. Already created by 068 in this exact shape; restated for re-runnability.
CREATE INDEX IF NOT EXISTS idx_car_orders_status
  ON car_orders (status, created_at ASC);

-- ── Grants and RLS, restated ────────────────────────────────────────────────
--
-- 068 set both; new COLUMNS inherit the table's policies and the table's grants,
-- so nothing here widens access. Restated because hosted Supabase and a local
-- `supabase start` disagree about default grants (036), and because a reader
-- checking "can a customer write their own `status = 'paid'`?" should find the
-- answer in the migration that introduced the state.
--
-- SELECT ONLY for `authenticated`, no `anon` at all, and still NO write policy:
-- recording a balance is a service-role write behind an admin-guarded route, and
-- a customer who could UPDATE this table would mark their own car fully paid.
ALTER TABLE car_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON car_orders TO authenticated;
GRANT ALL    ON car_orders TO service_role;

COMMENT ON TABLE car_orders IS
  'One customer buying one car: a Paystack DEPOSIT reserves it (deposit_paid), the balance is settled offline and recorded by an admin (paid). uq_car_orders_live holds the vehicle through both.';
COMMENT ON COLUMN car_orders.price_pesewas IS
  'The full agreed price in pesewas, SNAPSHOTTED at purchase — the listing''s figure, or this customer''s own quote or accepted offer. Never re-read from car_listings.';
COMMENT ON COLUMN car_orders.price_source IS
  'listing | quote | accepted_offer — where price_pesewas came from, so a dispute is settled without a join. Anything but listing names its car_enquiry_id.';
COMMENT ON COLUMN car_orders.car_enquiry_id IS
  'The car_enquiries row that carries the agreed figure (a quoted price request, or an accepted offer). RESTRICT: the evidence for a private price outlives nothing.';
COMMENT ON COLUMN car_orders.price_state IS
  'fixed | negotiable | on_request, as the listing stood. on_request is admitted from 069 and is only ever reachable with price_source <> listing — such a listing has no public price to buy at.';
COMMENT ON COLUMN car_orders.deposit_pesewas IS
  'What Paystack was asked for, snapshotted at checkout from car_deposit_percent. A later change to that setting never alters an existing order.';
COMMENT ON COLUMN car_orders.deposit_percent IS
  'The whole-percent setting that produced deposit_pesewas. 100 on every pre-069 row: they were charged in full.';
COMMENT ON COLUMN car_orders.balance_pesewas IS
  'price_pesewas - deposit_pesewas, computed by the database so it can never drift from its inputs. Zero means the deposit was the whole price.';
COMMENT ON COLUMN car_orders.status IS
  'pending_payment → deposit_paid → paid → processing → in_transit → delivered, plus cancelled from pending_payment only. paid means FULLY paid. Edges live in src/features/cars/car-orders.types.ts.';
COMMENT ON COLUMN car_orders.deposit_paid_at IS
  'When the Paystack deposit settled. Distinct from paid_at, which is when the offline balance was recorded and the car became fully paid.';
COMMENT ON COLUMN car_orders.balance_amount_pesewas IS
  'The figure an admin recorded as received offline. Explicit, never assumed from the arithmetic, so the number on the row is one a person typed on purpose.';

-- ── The deposit percentage, admin-tunable ───────────────────────────────────
--
-- Beside `payment_expiry_minutes` (059) in `site_settings`, for the reasons 059
-- and 066 both give: it is edited on the screen the admin already knows, audited
-- like every other setting, and changed without a deploy.
--
-- PUBLIC, because "pay 30% now and the balance on delivery" is a term of sale a
-- customer must be told BEFORE they press Buy, and the anon read policy is
-- `USING (is_public)` — which is also what lets the app read it through the
-- cookieless client on a statically rendered car page. Nothing here is sensitive;
-- it is the same number that will be printed on the button.
--
-- 30 because that is the decision (Kelvin, 2026-09-16). The app treats a missing,
-- unreadable or nonsensical value as 30 as well, and logs: a deposit setting that
-- fails open at 100% would ask a MoMo wallet for the whole car, which is the
-- thing this migration exists to stop.
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('car_deposit_percent', '30'::jsonb,
   'Car deposit (%)',
   'How much of a car''s price is taken by Paystack up front to reserve the vehicle. The balance is settled offline and recorded by an admin. Changing this only affects checkouts started afterwards; an order already placed keeps the deposit it was quoted.',
   true)
ON CONFLICT (key) DO NOTHING;

COMMIT;
