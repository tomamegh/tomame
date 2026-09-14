-- Migration 058: count the catalogue's categories in the database.
--
-- The browse screen needs "which categories do we hold, and how many in each".
-- The obvious implementation selects every row's `category` and counts them in
-- TypeScript, and it is wrong in a way that does not announce itself: PostgREST
-- caps a response at `max-rows` (1000 on Supabase by default), so past a
-- thousand products the counts silently become counts of the first thousand.
-- Hosted dev already holds 947 and the scraper adds to it every hour, so this
-- was days from producing quietly wrong numbers on a customer-facing screen.
--
-- A GROUP BY in the database has no such ceiling, reads one row per category
-- instead of one per product, and is the shape the question actually has.
--
-- STABLE, not VOLATILE: it only reads. SECURITY INVOKER (the default) so it runs
-- as its caller; `catalog_products` is readable and this adds no new access.

BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_categories()
RETURNS TABLE (category TEXT, count BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.category, count(*) AS count
    FROM catalog_products p
   WHERE p.category IS NOT NULL
     AND btrim(p.category) <> ''
   GROUP BY p.category
   -- Largest first, then alphabetical, so the order is stable between calls and
   -- the screen does not reshuffle its headings on every render.
   ORDER BY count(*) DESC, p.category ASC;
$$;

COMMENT ON FUNCTION public.catalog_categories() IS
  'Categories the catalogue holds, largest first. Counts in the database because a client-side count is capped by PostgREST max-rows.';

-- The browse screen is public (the quote flow is open to signed-out visitors),
-- so both roles need it. `anon` reads exactly what it could already read.
GRANT EXECUTE ON FUNCTION public.catalog_categories() TO anon, authenticated, service_role;

-- The GROUP BY and the per-category listing both scan on `category`.
CREATE INDEX IF NOT EXISTS idx_catalog_products_category
  ON catalog_products (category, price_usd);

COMMIT;
