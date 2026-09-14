-- Migration 055: a pasted link teaches the catalogue what to scrape next.
--
-- Kelvin's ask: "As a user I should say what I want and the system should fetch
-- from what is pre-scrapped and also once the user paste their own link we
-- should scrape similar products."
--
-- The first half already exists and is simply not wired to a screen:
-- `catalog_queries` (045) holds seeded search terms, the hourly `catalog-scrape`
-- job spends one vendor call per tick filling `catalog_products`, and
-- `searchCatalog` text-matches that table and prices every hit. What is missing
-- there is a customer-facing search, not a backend.
--
-- The second half is this migration. A pasted link is the single best signal we
-- ever get about what a customer actually wants, and today it is thrown away the
-- moment the quote is produced. `source` allowed only 'seed' and 'admin', so
-- there was no way to record a query the product itself suggested.
--
-- WHY THIS IS NOT "SCRAPE ON PASTE". The obvious build is to fire a vendor
-- search the instant someone pastes. That would be wrong twice over. The vendor
-- is ScraperAPI's free tier, roughly 1000 calls a MONTH shared with the live
-- paste flow (`src/config/catalog.ts`), so N pastes would become 2N calls and
-- the budget would be gone in a week, taking the live quote path down with it.
-- And it would put a slow third-party search on the critical path of a screen
-- whose whole design is about answering fast. So a paste ENQUEUES a query and
-- the existing budget-capped job picks it up on its own schedule. The customer
-- gets similar products from the catalogue we already hold, and the catalogue
-- gets better every time somebody pastes.

BEGIN;

-- ── `paste` becomes a legitimate origin for a query ─────────────────────────
ALTER TABLE catalog_queries DROP CONSTRAINT IF EXISTS catalog_queries_source_check;
ALTER TABLE catalog_queries ADD CONSTRAINT catalog_queries_source_check
  CHECK (source IN ('seed', 'admin', 'paste'));

COMMENT ON COLUMN catalog_queries.source IS
  'Where the search term came from. seed = shipped list, admin = typed in the console, paste = derived from a product a customer pasted (055).';

-- What the query was derived from, so an operator can see WHY a term is in the
-- list and so a bad derivation can be traced back to the product that produced
-- it. SET NULL rather than CASCADE: the cache row is evictable by design
-- (`cleanup-extraction-cache` runs every ten minutes) and losing it must not
-- silently delete a query that is now earning its place.
ALTER TABLE catalog_queries
  ADD COLUMN IF NOT EXISTS derived_from_cache_id UUID
    REFERENCES extraction_cache(id) ON DELETE SET NULL;

-- ── Priority, so a guess never outranks a decision ──────────────────────────
-- A derived query is a guess made from one product title. A seeded query was
-- chosen deliberately. When the budget only affords a handful of calls a day,
-- the deliberate ones must win, and the scrape job already orders by priority.
--
-- Enforced rather than left to the writer: the whole risk of this feature is a
-- flood of low-value derived terms crowding out the curated list, and "the
-- service remembers to pass a high number" is not a guarantee.
ALTER TABLE catalog_queries DROP CONSTRAINT IF EXISTS catalog_queries_paste_priority;
ALTER TABLE catalog_queries ADD CONSTRAINT catalog_queries_paste_priority
  CHECK (source <> 'paste' OR priority >= 100);

-- ── One row per (store, query), so a popular product cannot flood the list ──
-- Ten customers pasting the same headphones must enqueue ONE term, not ten. The
-- upsert the service performs needs a unique index to conflict against, and
-- without it `ON CONFLICT` cannot be expressed at all.
--
-- Lowercased and whitespace-collapsed so "AirPods Pro" and "airpods  pro" are
-- the same row. IMMUTABLE expressions only, which `lower()` and `btrim()` are;
-- `regexp_replace` with a constant pattern is too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_queries_store_term
  ON catalog_queries (store, lower(btrim(regexp_replace(query, '\s+', ' ', 'g'))));

-- The scrape job asks "what is due, most important first". Derived rows make
-- that list long enough to be worth an index.
CREATE INDEX IF NOT EXISTS idx_catalog_queries_due
  ON catalog_queries (is_active, priority, next_run_at)
  WHERE is_active;

COMMIT;
