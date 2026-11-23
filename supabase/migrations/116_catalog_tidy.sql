-- 116: the catalogue is deduped, re-filed and cleaned (site brief, Fix 4).
--
-- Browse showed Crocs Classic Clog ×4, Tide PODS ×2 and Under Armour Tech 2.0
-- ×4 (every size and colour is its own ASIN at its own price), men's polos under
-- Women's Clothing, wrist braces under Baby, a fire pit under Cycling and a space
-- heater under Musical Instruments, and "Global Recycled Standard" stuck to 642
-- titles. The rules live in src/features/catalog/catalog-tidy.ts and run on every
-- scrape write; the catalog-tidy job applies them to rows written before.
--
-- * title_key: the product's identity at its store (normalised display title).
-- * tidy_version: which version of the rules last saw the row; the job works
--   through rows below the current version, so a rule change re-runs itself.
-- * dedupe_note: on the listing kept from a set of duplicates, why its price is
--   the current one.

BEGIN;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS title_key text,
  ADD COLUMN IF NOT EXISTS tidy_version smallint,
  ADD COLUMN IF NOT EXISTS dedupe_note text;

CREATE INDEX IF NOT EXISTS idx_catalog_products_title_key ON catalog_products (store, title_key) WHERE title_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_products_tidy ON catalog_products (tidy_version NULLS FIRST, id);

COMMENT ON COLUMN catalog_products.title_key IS '116: normalised display title; one listing per (store, title_key).';
COMMENT ON COLUMN catalog_products.tidy_version IS '116: version of the catalog-tidy rules that last saw this row.';
COMMENT ON COLUMN catalog_products.dedupe_note IS '116: on a kept listing, why its price was kept over its duplicates.';

-- Bulk write of the tidy job's verdicts. A changed category re-queues the
-- landed price (the pricing group may differ).
CREATE OR REPLACE FUNCTION set_catalog_tidy(p_rows jsonb)
RETURNS int
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT (r->>'id')::uuid AS id, r->>'title' AS title, r->>'title_key' AS title_key,
           r->>'category' AS category, (r->>'tidy_version')::smallint AS tidy_version
      FROM jsonb_array_elements(p_rows) r
  ), done AS (
    UPDATE catalog_products c
       SET title = coalesce(nullif(v.title, ''), c.title),
           title_key = v.title_key,
           category = coalesce(v.category, c.category),
           tidy_version = v.tidy_version,
           landed_priced_at = CASE WHEN v.category IS DISTINCT FROM c.category AND v.category IS NOT NULL THEN NULL ELSE c.landed_priced_at END
      FROM v
     WHERE c.id = v.id
    RETURNING c.id
  )
  SELECT count(*)::int FROM done;
$$;

-- Duplicate sets among tidied rows: every row of up to p_groups (store,
-- title_key) sets holding more than one listing.
CREATE OR REPLACE FUNCTION catalog_title_duplicates(p_groups int DEFAULT 200)
RETURNS TABLE (store text, title_key text, id uuid, price_usd numeric, landed_ghs numeric, last_seen_at timestamptz, referenced boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH groups AS (
    SELECT p.store, p.title_key
      FROM catalog_products p
     WHERE p.title_key IS NOT NULL AND p.title_key <> ''
     GROUP BY p.store, p.title_key
    HAVING count(*) > 1
     LIMIT p_groups
  )
  SELECT p.store, p.title_key, p.id, p.price_usd, p.landed_ghs, p.last_seen_at, catalog_product_is_referenced(p.url_hash)
    FROM catalog_products p
    JOIN groups g ON g.store = p.store AND g.title_key = p.title_key;
$$;

CREATE OR REPLACE FUNCTION set_catalog_dedupe_notes(p_rows jsonb)
RETURNS int
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH done AS (
    UPDATE catalog_products c SET dedupe_note = r->>'note'
      FROM jsonb_array_elements(p_rows) r
     WHERE c.id = (r->>'id')::uuid
    RETURNING c.id
  )
  SELECT count(*)::int FROM done;
$$;

REVOKE ALL ON FUNCTION set_catalog_tidy(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_title_duplicates(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_catalog_dedupe_notes(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_catalog_tidy(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_title_duplicates(int) TO service_role;
GRANT EXECUTE ON FUNCTION set_catalog_dedupe_notes(jsonb) TO service_role;

-- As run_catalog_cleanup() (084): through run_catalog_job, vault first.
CREATE OR REPLACE FUNCTION run_catalog_tidy() RETURNS void AS $$
  SELECT run_catalog_job('/api/cron/catalog-tidy');
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION run_catalog_tidy() FROM PUBLIC, anon, authenticated;

-- Every 10 minutes: a backlog of ~50k rows clears in about a day, then each run
-- only sees what the scraper wrote since (scrape writes are already tidy).
DO $$
BEGIN
  PERFORM cron.unschedule('catalog-tidy') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'catalog-tidy');
  PERFORM cron.schedule('catalog-tidy', '2-59/10 * * * *', 'SELECT run_catalog_tidy();');
END $$;

COMMIT;
