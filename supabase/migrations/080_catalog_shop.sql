-- Migration 080: the shop screen — filter, sort and page the priced catalogue
-- in the database.
--
-- WHY. Browse mode on `/app/orders/new` opened one department at a time, priced
-- up to 120 rows in memory and sorted them there, with a "show more" that grew
-- the page. Kelvin (2026-09-30): "there is no pagination and I want it grouped
-- nicely, with nicer filtering." Real filters (store, condition, a GH₵ price
-- range, rating) and a real pager need the database to do the narrowing and
-- the ordering, which it cannot do on a number it has never seen.
--
-- THE LANDED PRICE IS STORED, AND STILL STRUCK BY THE CALCULATOR.
-- `landed_ghs` is written by the app (`refreshCatalogLandedPrices`), which runs
-- every row through `src/lib/pricing/calculator.ts` — the one place the pricing
-- rules live. Nothing here re-implements a fee, a freight shape or an FX rate;
-- SQL only filters and sorts on the figure the calculator produced. The screen
-- still prices the page it draws live, so a card never shows a stored number:
-- the stored one decides WHICH rows land on the page and in what order.
--
--   landed_ghs        the calculator's total_ghs for quantity 1, or NULL when
--                     the engine declined (no listed price, needs_review).
--   landed_priced_at  when that was struck; NULL means "not priced yet". The
--                     scraper's upsert sets it back to NULL so a re-read listing
--                     is re-priced on the next refresh.
--
-- CONDITION AND POPULARITY are generated from what the scraper already keeps in
-- `raw`, so they cannot drift from it. eBay's condition string is noisy ("512
-- GBOpen Box", "AcerBrand New") and is matched on its tail words; Amazon rows
-- carry no condition and stay NULL rather than being assumed new.

BEGIN;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS landed_ghs numeric,
  ADD COLUMN IF NOT EXISTS landed_priced_at timestamptz;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS condition_group text GENERATED ALWAYS AS (
    CASE
      WHEN raw ->> 'condition' ~* 'refurbished' THEN 'refurbished'
      WHEN raw ->> 'condition' ~* 'open box' THEN 'open_box'
      WHEN raw ->> 'condition' ~* '(pre-owned|used)' THEN 'used'
      WHEN raw ->> 'condition' ~* 'new' THEN 'new'
      ELSE NULL
    END
  ) STORED;

-- Amazon stores review counts, eBay "items sold" (as text). One number per row
-- that says "people bought this", for the Recommended order.
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS popularity int GENERATED ALWAYS AS (
    coalesce(
      review_count,
      CASE WHEN raw ->> 'items_sold' ~ '^[0-9]{1,9}$' THEN (raw ->> 'items_sold')::int END
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_catalog_products_landed
  ON catalog_products (landed_ghs) WHERE landed_ghs IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_products_category_landed
  ON catalog_products (category, landed_ghs);
CREATE INDEX IF NOT EXISTS idx_catalog_products_store
  ON catalog_products (store);
CREATE INDEX IF NOT EXISTS idx_catalog_products_landed_priced_at
  ON catalog_products (landed_priced_at NULLS FIRST);

-- ── Writing the calculator's figures back ───────────────────────────────────
-- One statement for a whole batch: `[{ "id": uuid, "landed_ghs": number|null }]`.
-- Service role only; the app is the only thing that may say what a row costs.
CREATE OR REPLACE FUNCTION public.set_catalog_landed_prices(p_rows jsonb)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE catalog_products c
       SET landed_ghs = nullif(r ->> 'landed_ghs', '')::numeric,
           landed_priced_at = now()
      FROM jsonb_array_elements(p_rows) r
     WHERE c.id = (r ->> 'id')::uuid
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

REVOKE ALL ON FUNCTION public.set_catalog_landed_prices(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_landed_prices(jsonb) TO service_role;

-- ── One page of the shop ────────────────────────────────────────────────────
-- Every filter is optional (NULL = not filtering). `total_count` is struck over
-- the filtered set before LIMIT/OFFSET and rides on every row, as in 063.
--
-- Sorts: recommended | newest | price_asc | price_desc | rating. Every order
-- ends on `id`, so a page boundary never shuffles a row onto two pages.
-- Recommended is text rank during a search, otherwise priced rows first, most
-- bought/reviewed first, then cheapest landed.
CREATE OR REPLACE FUNCTION public.browse_catalog_products(
  p_q text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_stores text[] DEFAULT NULL,
  p_conditions text[] DEFAULT NULL,
  p_min_ghs numeric DEFAULT NULL,
  p_max_ghs numeric DEFAULT NULL,
  p_min_rating numeric DEFAULT NULL,
  p_sort text DEFAULT 'recommended',
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, store text, external_id text, product_url text, title text, image_url text,
  price_usd numeric, currency text, rating numeric, review_count int, category text,
  last_seen_at timestamptz, landed_ghs numeric, condition_group text, rank real,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT nullif(btrim(coalesce(p_q, '')), '') AS term,
           websearch_to_tsquery('english', coalesce(p_q, '')) AS tsq
  ),
  matched AS (
    SELECT p.*,
           CASE WHEN q.term IS NULL THEN 0::real
                ELSE (ts_rank(p.search, q.tsq) + extensions.similarity(p.title, q.term))::real
           END AS rank
      FROM catalog_products p, q
     WHERE (q.term IS NULL OR p.search @@ q.tsq OR extensions.similarity(p.title, q.term) > 0.15)
       AND (p_category IS NULL OR p.category = p_category)
       AND (p_stores IS NULL OR cardinality(p_stores) = 0 OR p.store = ANY (p_stores))
       AND (p_conditions IS NULL OR cardinality(p_conditions) = 0 OR p.condition_group = ANY (p_conditions))
       AND (p_min_ghs IS NULL OR p.landed_ghs >= p_min_ghs)
       AND (p_max_ghs IS NULL OR p.landed_ghs <= p_max_ghs)
       AND (p_min_rating IS NULL OR p.rating >= p_min_rating)
  )
  SELECT m.id, m.store, m.external_id, m.product_url, m.title, m.image_url,
         m.price_usd, m.currency, m.rating, m.review_count, m.category,
         m.last_seen_at, m.landed_ghs, m.condition_group, m.rank,
         count(*) OVER () AS total_count
    FROM matched m
   ORDER BY
     -- A row we cannot price never leads a page, whatever the order.
     (m.landed_ghs IS NULL) ASC,
     CASE WHEN p_sort = 'recommended' THEN m.rank END DESC NULLS LAST,
     CASE WHEN p_sort = 'recommended' THEN m.popularity END DESC NULLS LAST,
     CASE WHEN p_sort = 'recommended' THEN m.rating END DESC NULLS LAST,
     CASE WHEN p_sort = 'newest' THEN m.last_seen_at END DESC NULLS LAST,
     CASE WHEN p_sort = 'price_desc' THEN m.landed_ghs END DESC NULLS LAST,
     CASE WHEN p_sort = 'rating' THEN m.rating END DESC NULLS LAST,
     CASE WHEN p_sort = 'rating' THEN m.review_count END DESC NULLS LAST,
     m.landed_ghs ASC NULLS LAST,
     m.price_usd ASC NULLS LAST,
     m.id
   LIMIT least(greatest(coalesce(p_limit, 24), 1), 60)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.browse_catalog_products(text, text, text[], text[], numeric, numeric, numeric, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.browse_catalog_products(text, text, text[], text[], numeric, numeric, numeric, text, int, int) TO service_role;

-- ── Facet counts ────────────────────────────────────────────────────────────
-- Disjunctive: each group is counted with every OTHER filter applied and its
-- own left off, so ticking "eBay" still shows how many Amazon rows there are
-- to add. Price buckets are `width_bucket` over the edges the app passes (the
-- labels are the app's; the counts are the data's). `range` returns the priced
-- min and max so the inputs can say what is there.
CREATE OR REPLACE FUNCTION public.catalog_shop_facets(
  p_q text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_stores text[] DEFAULT NULL,
  p_conditions text[] DEFAULT NULL,
  p_min_ghs numeric DEFAULT NULL,
  p_max_ghs numeric DEFAULT NULL,
  p_min_rating numeric DEFAULT NULL,
  p_price_edges numeric[] DEFAULT ARRAY[500, 1000, 2500, 5000, 10000]::numeric[]
)
RETURNS TABLE (facet text, value text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT nullif(btrim(coalesce(p_q, '')), '') AS term,
           websearch_to_tsquery('english', coalesce(p_q, '')) AS tsq
  ),
  m AS (
    SELECT p.category, p.store, p.condition_group, p.landed_ghs, p.rating,
           (p_category IS NULL OR p.category = p_category) AS f_cat,
           (p_stores IS NULL OR cardinality(p_stores) = 0 OR p.store = ANY (p_stores)) AS f_store,
           (p_conditions IS NULL OR cardinality(p_conditions) = 0 OR p.condition_group = ANY (p_conditions)) AS f_cond,
           ((p_min_ghs IS NULL OR p.landed_ghs >= p_min_ghs) AND (p_max_ghs IS NULL OR p.landed_ghs <= p_max_ghs)) AS f_price,
           (p_min_rating IS NULL OR p.rating >= p_min_rating) AS f_rating
      FROM catalog_products p, q
     WHERE (q.term IS NULL OR p.search @@ q.tsq OR extensions.similarity(p.title, q.term) > 0.15)
  )
  SELECT 'category', m.category, count(*) FROM m
   WHERE m.f_store AND m.f_cond AND m.f_price AND m.f_rating
     AND m.category IS NOT NULL AND btrim(m.category) <> ''
   GROUP BY m.category
  UNION ALL
  SELECT 'store', m.store, count(*) FROM m
   WHERE m.f_cat AND m.f_cond AND m.f_price AND m.f_rating
   GROUP BY m.store
  UNION ALL
  SELECT 'condition', m.condition_group, count(*) FROM m
   WHERE m.f_cat AND m.f_store AND m.f_price AND m.f_rating AND m.condition_group IS NOT NULL
   GROUP BY m.condition_group
  UNION ALL
  SELECT 'price', width_bucket(m.landed_ghs, p_price_edges)::text, count(*) FROM m
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_rating AND m.landed_ghs IS NOT NULL
   GROUP BY width_bucket(m.landed_ghs, p_price_edges)
  UNION ALL
  SELECT 'rating', t.stars::text, count(*) FROM m
   CROSS JOIN (VALUES (4), (3)) AS t(stars)
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_price AND m.rating >= t.stars
   GROUP BY t.stars
  UNION ALL
  SELECT 'range', 'min', floor(min(m.landed_ghs))::bigint FROM m
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_rating AND m.landed_ghs IS NOT NULL
   HAVING count(*) > 0
  UNION ALL
  SELECT 'range', 'max', ceil(max(m.landed_ghs))::bigint FROM m
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_rating AND m.landed_ghs IS NOT NULL
   HAVING count(*) > 0;
$$;

REVOKE ALL ON FUNCTION public.catalog_shop_facets(text, text, text[], text[], numeric, numeric, numeric, numeric[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_shop_facets(text, text, text[], text[], numeric, numeric, numeric, numeric[]) TO service_role;

-- ── The grouped front page ──────────────────────────────────────────────────
-- The top `p_per` rows of every department in the Recommended order, with the
-- department's own size. One statement for the whole page, instead of one read
-- per shelf.
CREATE OR REPLACE FUNCTION public.catalog_department_tops(p_per int DEFAULT 4)
RETURNS TABLE (
  id uuid, store text, external_id text, product_url text, title text, image_url text,
  price_usd numeric, currency text, rating numeric, review_count int, category text,
  last_seen_at timestamptz, landed_ghs numeric, condition_group text,
  category_count bigint, shelf_position int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT p.*,
           count(*) OVER (PARTITION BY p.category) AS category_count,
           row_number() OVER (
             PARTITION BY p.category
             ORDER BY (p.landed_ghs IS NULL) ASC, p.popularity DESC NULLS LAST,
                      p.rating DESC NULLS LAST, p.landed_ghs ASC NULLS LAST, p.id
           )::int AS shelf_position
      FROM catalog_products p
     WHERE p.category IS NOT NULL AND btrim(p.category) <> ''
  )
  SELECT r.id, r.store, r.external_id, r.product_url, r.title, r.image_url,
         r.price_usd, r.currency, r.rating, r.review_count, r.category,
         r.last_seen_at, r.landed_ghs, r.condition_group, r.category_count, r.shelf_position
    FROM ranked r
   WHERE r.shelf_position <= least(greatest(coalesce(p_per, 4), 1), 12)
   ORDER BY r.category_count DESC, r.category ASC, r.shelf_position ASC;
$$;

REVOKE ALL ON FUNCTION public.catalog_department_tops(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_department_tops(int) TO service_role;

COMMIT;
