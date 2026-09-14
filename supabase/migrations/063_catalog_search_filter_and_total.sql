-- Migration 063: the catalogue search learns to filter by category and to say
-- how many matches it actually found.
--
-- WHY. "Already priced" on `/app/orders/new` had category pills and no search
-- box at all, and the only search over the same catalogue lived on another
-- screen behind a one-line footnote most people never read (Kelvin, 2026-09-14:
-- "there is no search button... a user will not painfully go through all the
-- items"). Putting the search on the browse half means the two controls now sit
-- side by side, and the moment they do, two things are missing from the RPC:
--
--   1. A CATEGORY FILTER. The pills have to keep working while a search is
--      running, otherwise pressing one silently throws the query away.
--   2. A TOTAL. `p_limit` rows came back with no way to tell "that is all of
--      them" from "that is the first page", so the screen could neither print an
--      honest "24 of 63" nor decide whether to offer more.
--
-- `count(*) over ()` is struck over the matched set BEFORE the limit, which is
-- what makes it the real total rather than the page size. It rides on every row
-- because a `returns table` RPC has nowhere else to put it; the caller reads it
-- off the first row and ignores the rest.
--
-- THE CAP GOES UP, 50 → 120. The catalogue passed 700 products while the browse
-- screen was still showing 24 per shelf, so "show more" is the point of this
-- change and a cap of 50 would stop it after one press. 120 is the ceiling the
-- pricing pass can absorb: every row on the page is priced live, in one
-- calculator instance, and that loop is CPU-bound after the first row loads FX.
--
-- DROP AND RECREATE, not CREATE OR REPLACE: adding a parameter makes a new
-- overload rather than replacing the old one, and two overloads that both accept
-- (p_q, p_limit) are ambiguous to PostgREST. Dropping takes the grants with it,
-- so they are restated below — 061 keeps this function deliberately public, and
-- losing that grant would 404 the catalogue for signed-out visitors.

DROP FUNCTION IF EXISTS search_catalog_products(text, int);

CREATE OR REPLACE FUNCTION search_catalog_products(
  p_q text,
  p_limit int DEFAULT 12,
  -- NULL means every category, which is what the "All" pill sends.
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, store text, external_id text, product_url text, title text, image_url text,
  price_usd numeric, currency text, rating numeric, review_count int, category text,
  last_seen_at timestamptz, rank real, total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_q) AS tsq),
  matched AS (
    SELECT p.id, p.store, p.external_id, p.product_url, p.title, p.image_url,
           p.price_usd, p.currency, p.rating, p.review_count, p.category, p.last_seen_at,
           (ts_rank(p.search, q.tsq) + extensions.similarity(p.title, p_q))::real AS rank
    FROM catalog_products p, q
    WHERE (p.search @@ q.tsq OR extensions.similarity(p.title, p_q) > 0.15)
      -- A category the search does not hold simply matches nothing, which the
      -- screen already renders as "no matches"; it is never an error.
      AND (p_category IS NULL OR p.category = p_category)
  )
  SELECT m.id, m.store, m.external_id, m.product_url, m.title, m.image_url,
         m.price_usd, m.currency, m.rating, m.review_count, m.category, m.last_seen_at,
         m.rank, count(*) OVER () AS total_count
  FROM matched m
  ORDER BY m.rank DESC, m.price_usd ASC NULLS LAST
  LIMIT least(greatest(p_limit, 1), 120);
$$;

GRANT EXECUTE ON FUNCTION search_catalog_products(text, int, text) TO anon, authenticated, service_role;

-- The filtered search's own index. Without it a pill press over a large
-- catalogue filters by scanning every text match it just found.
CREATE INDEX IF NOT EXISTS idx_catalog_products_category
  ON catalog_products (category) WHERE category IS NOT NULL;
