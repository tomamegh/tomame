-- Migration 121: the held price (Seamless Roadmap, Initiative 1).
--
-- 044's lock holds the FX only: the store's price, our freight and our fees
-- can still move a quote's total before the customer pays. Leadership chose a
-- CEDI CAP (2026-11-23): inside the lock's 24 hours, a rise of up to
-- `price_hold_cap_ghs` is absorbed and the customer pays what they were quoted;
-- above it they are shown the new total before paying. Never a silent charge.
--
-- `held_unit_ghs` is the quoted total PER UNIT, store shipping excluded — the
-- customer picks the store's shipping service, so a dearer service they chose
-- is theirs, not ours to absorb. Written once, at mint, by the server, and
-- only when the mint was priced from the store: a quote priced from a
-- customer-typed gap-filler holds nothing (NULL), so nobody can hold a price
-- they named themselves. The rule that reads it lives in
-- src/lib/pricing/price-hold.ts.

BEGIN;

ALTER TABLE quote_locks ADD COLUMN IF NOT EXISTS held_unit_ghs NUMERIC;

ALTER TABLE quote_locks DROP CONSTRAINT IF EXISTS quote_locks_held_unit_positive;
ALTER TABLE quote_locks ADD CONSTRAINT quote_locks_held_unit_positive
  CHECK (held_unit_ghs IS NULL OR held_unit_ghs > 0);

COMMENT ON COLUMN quote_locks.held_unit_ghs IS
  '121. Quoted total per unit at mint, store shipping excluded; NULL when the quote used a customer gap-filler. Read by src/lib/pricing/price-hold.ts.';

INSERT INTO pricing_constants (key, value, label, description, unit) VALUES
  ('price_hold_cap_ghs', 50, 'Price Hold Cap',
   'Most a quoted total may rise (store price, freight or fees) inside the rate-lock window and still be charged at the quoted total. Above it the customer sees the new total before paying. 0 turns the hold off.',
   'GHS')
ON CONFLICT (key) DO NOTHING;

COMMIT;
