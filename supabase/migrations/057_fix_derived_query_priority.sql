-- Migration 057: 055 had the priority polarity backwards.
--
-- 055 added `catalog_queries_paste_priority`, CHECK (source <> 'paste' OR
-- priority >= 100), and its comment said the rule existed so "a term guessed
-- from one product title can never outrank a curated one while the budget only
-- affords a few calls a day".
--
-- It guaranteed the exact opposite. `claim_next_catalog_query` (045) orders
--
--     order by c.next_run_at asc, c.priority desc
--
-- so a HIGHER priority is claimed FIRST, and the 84 seeded terms sit at 2 to 10.
-- A floor of 100 would therefore have put every guess derived from a paste ahead
-- of every term anyone chose deliberately, and on a vendor budget of roughly
-- 1000 calls a month the curated list would simply have stopped being scraped.
--
-- Caught before it could do anything: no row with source 'paste' exists on any
-- environment yet, because the code that writes them ships with this fix.
--
-- A CORRECTIVE MIGRATION RATHER THAN AN EDIT TO 055, because 055 is already
-- applied to local, hosted dev and production. Editing an applied migration
-- changes the file and no database, which is how two environments quietly stop
-- matching their own history.

BEGIN;

-- Below every seeded term (2 to 10), so a derived guess is scraped only when
-- nothing curated is due. 1 rather than 0 leaves room to demote something
-- further later without another migration.
ALTER TABLE catalog_queries DROP CONSTRAINT IF EXISTS catalog_queries_paste_priority;
ALTER TABLE catalog_queries ADD CONSTRAINT catalog_queries_paste_priority
  CHECK (source <> 'paste' OR priority <= 1);

COMMENT ON CONSTRAINT catalog_queries_paste_priority ON catalog_queries IS
  'A paste-derived term sorts below every curated one. claim_next_catalog_query orders by priority DESC, so low means last.';

-- Nothing to backfill, but written as a guarded UPDATE anyway so that re-running
-- this file on an environment that somehow acquired a high-priority derived row
-- repairs it instead of failing the ALTER above.
UPDATE catalog_queries SET priority = 1 WHERE source = 'paste' AND priority > 1;

-- ── While here: 055's "due" index was a no-op ───────────────────────────────
-- 055 declared `idx_catalog_queries_due (is_active, priority, next_run_at)
-- WHERE is_active`, but 045 had already created an index of that NAME as
-- `(next_run_at, priority DESC) WHERE is_active`. `CREATE INDEX IF NOT EXISTS`
-- matches on name, not on definition, so it was skipped with a notice and 055's
-- version never existed. That is the right outcome: 045's index matches the
-- claim function's ORDER BY exactly, and 055's did not. Recorded here so the
-- next person does not go looking for an index the file appears to create.

COMMIT;
