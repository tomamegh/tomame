-- Migration 065: a watch a PERSON acts on, for the items the engine cannot price.
--
-- THE DEAD END THIS REMOVES. Paste a link to a store we do not know
-- (walmartcontacts.com, say) and the quote screen said "Not priced yet · This
-- store region is not supported yet" — and then offered "Add to bag" anyway.
-- The bag took the line, could not price it, and left the customer on
-- "Pay GH₵0.00" with a disabled button and two ways out: remove the item, or
-- watch a price that will never be checked. Kelvin, 2026-09-14: "A user cannot
-- be directed or shown the add to bag like the normal flow and payment cannot
-- be allowed in such cases."
--
-- So the bag still takes it — that part was right, the customer HAS chosen the
-- thing — but it takes it as a REQUEST. A buyer looks the item up, attaches
-- what it actually costs, and only then can the line be paid for.
--
-- WHY price_watches AND NOT A NEW TABLE. Kelvin's call, and the shape already
-- fits: a watch is "this customer wants this URL, tell them when something
-- changes". The only difference is who does the telling — a cron, or a person.
-- Everything else (the URL, the hash, the snapshotted name and image so the row
-- survives cache pruning, the owner RLS) is identical, and a parallel table
-- would duplicate all of it to change one verb.
--
-- WHICH MAKES `kind` LOAD-BEARING, not decorative. The nightly job claims work
-- with `listWatchesDueForCheck`, whose only filter was `is_active = true`. A
-- sourcing row is active by definition — it is waiting for a person — so
-- without this column every one of them would go straight into the scraper
-- queue, burning ScraperAPI credit (1000/month, shared with the live paste
-- flow) re-reading pages we already know we cannot price, every single night.
-- Kelvin: "a cron will not be checking for price differences, find a way to
-- label such products so is not treated as an item a cron has to pick up".
--
-- The label is enforced in three places on purpose: this column, the partial
-- index the claim query rides, and an explicit `.eq("kind", "price")` in the
-- query itself. The index alone is an optimisation, not a guarantee.

-- ── the label ─────────────────────────────────────────────────────────────────
-- DEFAULT 'price': every row that exists today was made by the watch button and
-- is a price watch. No backfill, and no window in which an existing row is
-- NULL and therefore invisible to a claim query that filters on this column.
ALTER TABLE price_watches
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'price'
    CHECK (kind IN ('price', 'sourcing'));

COMMENT ON COLUMN price_watches.kind IS
  'price = the nightly cron re-reads it | sourcing = a person prices it by hand; the cron must never claim it';

-- ── the admin''s answer ───────────────────────────────────────────────────────
-- `sourced_price_usd` and `sourced_origin_country` are the two facts the pricing
-- engine was missing. They are NOT a total: the buyer supplies what the item
-- costs and where it ships from, and `src/lib/pricing/calculator.ts` strikes the
-- cedi figure from them exactly as it does for any other line. A hand-typed
-- total would put a number on the pay button that no engine ever checked, which
-- CLAUDE.md forbids ("money calculations must run in route handlers or server
-- actions", "never trust the client").
ALTER TABLE price_watches
  ADD COLUMN IF NOT EXISTS sourcing_status TEXT
    CHECK (sourcing_status IN ('requested', 'available', 'unavailable')),
  -- The bag line this request backs, so answering it can fill the line's gaps
  -- and the bag can tell the customer which item is waiting. ON DELETE SET NULL:
  -- removing the line from the bag must not delete the buyer's work.
  ADD COLUMN IF NOT EXISTS sourcing_cart_item_id UUID REFERENCES cart_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sourced_price_usd NUMERIC
    CHECK (sourced_price_usd IS NULL OR sourced_price_usd > 0),
  ADD COLUMN IF NOT EXISTS sourced_origin_country TEXT
    CHECK (sourced_origin_country IS NULL OR sourced_origin_country IN ('USA', 'UK', 'CHINA')),
  -- What the buyer wants the customer to know: "in stock, ships from NJ", or
  -- why it could not be bought. Shown to the customer, so it is prose, not a code.
  ADD COLUMN IF NOT EXISTS sourced_note TEXT,
  -- What the CUSTOMER offered when they raised it — their own guess at the price
  -- and origin. Kept apart from the `sourced_*` columns because one is a hint and
  -- the other is what we will actually charge against.
  ADD COLUMN IF NOT EXISTS customer_price_hint_usd NUMERIC
    CHECK (customer_price_hint_usd IS NULL OR customer_price_hint_usd > 0),
  ADD COLUMN IF NOT EXISTS customer_origin_hint TEXT
    CHECK (customer_origin_hint IS NULL OR customer_origin_hint IN ('USA', 'UK', 'CHINA')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- The two kinds must not blur into each other. A price watch with a
-- `sourcing_status` would show up in the buyer's queue; a sourcing row without
-- one has no state to work.
ALTER TABLE price_watches DROP CONSTRAINT IF EXISTS price_watches_kind_status;
ALTER TABLE price_watches
  ADD CONSTRAINT price_watches_kind_status CHECK (
    (kind = 'price'    AND sourcing_status IS NULL) OR
    (kind = 'sourcing' AND sourcing_status IS NOT NULL)
  );

-- "Available" is the state that lets a customer pay, so it must carry the fact
-- that makes paying possible. Without this an admin could mark something
-- available with nothing attached, and the bag would re-price it to the same
-- nothing it could not price before.
ALTER TABLE price_watches DROP CONSTRAINT IF EXISTS price_watches_available_is_priced;
ALTER TABLE price_watches
  ADD CONSTRAINT price_watches_available_is_priced CHECK (
    sourcing_status IS DISTINCT FROM 'available'
    OR (sourced_price_usd IS NOT NULL AND sourced_origin_country IS NOT NULL)
  );

-- ── keeping the cron off them ────────────────────────────────────────────────
-- 041's index was `WHERE is_active`. Rebuilt so a sourcing row is not merely
-- skipped after being read — it is not in the index the claim query walks at all.
DROP INDEX IF EXISTS idx_price_watches_due;
CREATE INDEX IF NOT EXISTS idx_price_watches_due
  ON price_watches (last_checked_at ASC NULLS FIRST)
  WHERE is_active AND kind = 'price';

-- 041's per-customer list index, likewise split, so the Price watch screen and
-- the sourcing queue never scan each other's rows.
DROP INDEX IF EXISTS idx_price_watches_user;
CREATE INDEX IF NOT EXISTS idx_price_watches_user
  ON price_watches (user_id, is_active, created_at DESC)
  WHERE kind = 'price';

-- The buyer's queue: open requests, oldest first, because somebody is waiting.
CREATE INDEX IF NOT EXISTS idx_price_watches_sourcing_queue
  ON price_watches (sourcing_status, created_at ASC)
  WHERE kind = 'sourcing';

-- The bag's lookup: which of these lines is waiting on a person.
CREATE INDEX IF NOT EXISTS idx_price_watches_sourcing_line
  ON price_watches (sourcing_cart_item_id)
  WHERE sourcing_cart_item_id IS NOT NULL;

-- ── who may read it ──────────────────────────────────────────────────────────
-- 041 gave the owner SELECT and 061 removed every write grant from the API roles
-- (the app writes watches through the service role). Both still hold, and a
-- sourcing row is the owner's own data, so the existing owner policy already
-- covers the customer. What is missing is the buyer: `sourcing_status`,
-- `sourced_*` and `reviewed_by` are staff facts about somebody else's row.
DROP POLICY IF EXISTS "price_watches admin read" ON price_watches;
CREATE POLICY "price_watches admin read"
  ON price_watches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 041's UNIQUE (user_id, url_hash) is deliberately LEFT ALONE. It means one
-- customer cannot hold both a price watch and a sourcing request on the same
-- link, which is the right answer: the same row changes kind rather than the
-- customer ending up with two records of one intention, and the service upserts
-- onto it.

-- ── cart_items.sourced_price_usd — the buyer's price, which is not a gap-filler
--
-- WHY A SECOND PRICE COLUMN. `gap_price_usd` means "the customer typed this
-- because we could not read one", and `gapFillOverrides` honours it ONLY where
-- the snapshot has no price of its own — deliberately, so nobody can talk the
-- engine down from the store's real figure.
--
-- A buyer's answer is the opposite kind of fact. They went and looked. When the
-- scrape read $29.99 off a page we do not understand and the buyer says the item
-- is $34.50, the buyer is right, and writing that into `gap_price_usd` would see
-- it silently ignored — the line would price at the number nobody checked, and
-- the customer would be charged it. (Caught in local verification, 2026-09-14:
-- the bag showed GH₵40.00, which was the delivery fee and nothing else.)
--
-- So it is its own column with its own rule: when set, it IS the item price.
-- Only `answerSourcing` writes it, server-side, from an admin-guarded route.
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS sourced_price_usd NUMERIC
    CHECK (sourced_price_usd IS NULL OR sourced_price_usd > 0);

COMMENT ON COLUMN cart_items.sourced_price_usd IS
  'A buyer''s verified item price (065). Authoritative: overrides the snapshot, unlike gap_price_usd which only fills a gap.';
