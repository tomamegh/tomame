-- Migration 084: the catalogue scrapes more stores, finds the weights it was
-- missing, and cleans out what nobody can buy.
--
-- WHY. ScraperAPI is a paid plan now (100,000 credits a month from
-- 2026-09-29). Kelvin: scrape other stores too; and "products that are scraped
-- but cannot be priced are of no use". On prod every Amazon Office Products
-- row, and most of Appliances, Pet Supplies and Smart Home, had a store price
-- and no landed price: they sit in weight-priced groups and a SEARCH result
-- carries no weight, so the calculator correctly answers needs_review.
--
-- 1. STORES. Walmart (ScraperAPI structured `walmart/search`), Etsy and Nike
--    (Zyte `productList` on the store's own search page). Every one orders
--    through the paste flow today: a shop card links to /app/orders/new?url=,
--    and the extraction registry reads all five as `live`.
-- 2. FAIR TURNS. The claim takes the store whose last claim is oldest, then
--    that store's most overdue query, and only among stores the app says it can
--    search on this deployment (`p_stores`).
-- 3. WEIGHT ENRICHMENT. `landed_decline` says WHY a row has no figure; rows
--    declined only for lack of a weight are fetched once per run through a
--    product-details endpoint, the weight is stored, and the row is re-priced
--    by the calculator. At most two attempts per row.
-- 4. CLEAN-UP. A daily job deletes rows with no store price, rows still
--    unpriceable after enrichment or a grace period, listings not re-read in
--    30 days, and junk (no title, non-https URLs, duplicates). A product the
--    enrichment found no weight for is remembered (catalog_weight_misses) so a
--    re-scrape does not pay for the same empty lookups again. Nothing
--    references catalog_products by foreign key, but a product can be in a
--    bag, an order or a price watch by URL; such a row is never deleted.
-- 5. THE SHOP NEVER SHOWS AN UNPRICED ROW. Every shop and search read filters
--    `landed_ghs IS NOT NULL` and returns `weight_lbs`, so a card is priced
--    live with the same weight its stored figure was struck with.
--
-- The money rules still live only in src/lib/pricing/calculator.ts; SQL here
-- filters and deletes, it never prices.

BEGIN;

-- ── 1. Stores ───────────────────────────────────────────────────────────────
ALTER TABLE catalog_queries DROP CONSTRAINT IF EXISTS catalog_queries_store_check;
ALTER TABLE catalog_queries ADD CONSTRAINT catalog_queries_store_check
  CHECK (store IN ('amazon', 'ebay', 'walmart', 'etsy', 'nike'));

ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_store_check;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_store_check
  CHECK (store IN ('amazon', 'ebay', 'walmart', 'etsy', 'nike'));

-- ── 3. Weight enrichment columns ────────────────────────────────────────────
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS weight_lbs numeric,
  ADD COLUMN IF NOT EXISTS weight_source text,
  ADD COLUMN IF NOT EXISTS enrich_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrich_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS landed_decline text;

ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_weight_lbs_check;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_weight_lbs_check
  CHECK (weight_lbs IS NULL OR weight_lbs > 0);
ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_weight_source_check;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_weight_source_check
  CHECK (weight_source IS NULL OR weight_source IN ('scraperapi', 'oxylabs', 'zyte'));
ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_landed_decline_check;
ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_landed_decline_check
  CHECK (landed_decline IS NULL OR landed_decline IN ('no_price', 'needs_weight', 'unpriceable'));

COMMENT ON COLUMN catalog_products.weight_lbs IS
  'Item weight found by the enrichment job (084), passed to the calculator as the listed weight.';
COMMENT ON COLUMN catalog_products.landed_decline IS
  'Why landed_ghs is NULL once priced: no_price, needs_weight (a weight would price it), unpriceable (084).';

CREATE INDEX IF NOT EXISTS idx_catalog_products_enrich_due
  ON catalog_products (enrich_attempts, enrich_attempted_at NULLS FIRST)
  WHERE landed_decline = 'needs_weight' AND weight_lbs IS NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_products_last_seen
  ON catalog_products (last_seen_at);

-- Products the enrichment already looked for a weight on and found none,
-- kept after the clean-up deletes the row. Without it a re-scrape re-inserts
-- the listing with a fresh attempt count and the job pays for the same empty
-- lookups again every cycle. Forgotten after 90 days (a listing's details do
-- change), by the retention job at the end of this migration.
CREATE TABLE IF NOT EXISTS catalog_weight_misses (
  url_hash    text PRIMARY KEY,
  store       text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE catalog_weight_misses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON catalog_weight_misses TO service_role;
-- No policy: service role only. Nothing customer-facing reads it.

-- Every row declined before today has no reason yet. Re-queue them for the
-- landed-price refresh, which strikes the reason on its next pass.
UPDATE catalog_products SET landed_priced_at = NULL WHERE landed_ghs IS NULL AND landed_decline IS NULL;

-- The calculator's figure AND, when there is none, why (084).
-- `[{ "id": uuid, "landed_ghs": number|null, "decline": text|null }]`.
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
           landed_decline = CASE WHEN nullif(r ->> 'landed_ghs', '') IS NULL THEN nullif(r ->> 'decline', '') END,
           landed_priced_at = now()
      FROM jsonb_array_elements(p_rows) r
     WHERE c.id = (r ->> 'id')::uuid
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

REVOKE ALL ON FUNCTION public.set_catalog_landed_prices(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_landed_prices(jsonb) TO service_role;

-- ── 2. Fair turns between stores ────────────────────────────────────────────
-- Replaces 045's (timestamptz, int). A third parameter would otherwise make a
-- second overload, which PostgREST cannot choose between.
DROP FUNCTION IF EXISTS claim_next_catalog_query(timestamptz, int);

CREATE OR REPLACE FUNCTION claim_next_catalog_query(
  p_now timestamptz DEFAULT now(),
  p_requery_hours int DEFAULT 24,
  -- The stores this deployment can search right now (switch on, vendor key
  -- set). NULL = every store, for a caller that predates 084.
  p_stores text[] DEFAULT NULL
)
RETURNS SETOF catalog_queries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE catalog_queries q
     SET last_run_at = p_now,
         next_run_at = p_now + make_interval(hours => p_requery_hours),
         updated_at  = p_now
   WHERE q.id = (
     SELECT c.id
       FROM catalog_queries c
       JOIN (SELECT store, max(last_run_at) AS last_claimed FROM catalog_queries GROUP BY store) s
         ON s.store = c.store
      WHERE c.is_active
        AND c.next_run_at <= p_now
        AND (p_stores IS NULL OR c.store = ANY (p_stores))
      ORDER BY s.last_claimed ASC NULLS FIRST, c.next_run_at ASC, c.priority DESC
      LIMIT 1
        FOR UPDATE OF c SKIP LOCKED
   )
  RETURNING q.*;
$$;

REVOKE ALL ON FUNCTION claim_next_catalog_query(timestamptz, int, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_next_catalog_query(timestamptz, int, text[]) TO service_role;

-- ── 3. Claiming a row to enrich ─────────────────────────────────────────────
-- One row per call, stamped in the same statement so overlapping runs never
-- fetch the same product twice. The attempt is counted at the claim: a vendor
-- call that fails still spent its credit. Order: fewest attempts, then the
-- most bought, then the oldest.
CREATE OR REPLACE FUNCTION claim_catalog_enrichment(
  p_now timestamptz,
  p_retry_before timestamptz,
  p_max_attempts int,
  p_stores text[]
)
RETURNS TABLE (
  id uuid, store text, external_id text, product_url text, title text,
  price_usd numeric, currency text, category text, enrich_attempts int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE catalog_products p
     SET enrich_attempts = p.enrich_attempts + 1,
         enrich_attempted_at = p_now
   WHERE p.id = (
     SELECT c.id
       FROM catalog_products c
      WHERE c.landed_decline = 'needs_weight'
        AND c.weight_lbs IS NULL
        AND c.price_usd > 0
        AND c.enrich_attempts < p_max_attempts
        AND (c.enrich_attempted_at IS NULL OR c.enrich_attempted_at < p_retry_before)
        AND c.store = ANY (p_stores)
        AND NOT EXISTS (SELECT 1 FROM catalog_weight_misses m WHERE m.url_hash = c.url_hash)
      ORDER BY c.enrich_attempts ASC, c.popularity DESC NULLS LAST, c.first_seen_at ASC, c.id
      LIMIT 1
        FOR UPDATE SKIP LOCKED
   )
  RETURNING p.id, p.store, p.external_id, p.product_url, p.title,
            p.price_usd, p.currency, p.category, p.enrich_attempts;
$$;

REVOKE ALL ON FUNCTION claim_catalog_enrichment(timestamptz, timestamptz, int, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_catalog_enrichment(timestamptz, timestamptz, int, text[]) TO service_role;

-- ── 4. Clean-up ─────────────────────────────────────────────────────────────
-- Is a catalogue listing somebody's product? There is no foreign key to
-- catalog_products anywhere; the links are by identity. catalog_products and
-- extraction_cache share one url_hash (hashUrl), so a bag line, an order or a
-- quote on that product reaches it through the cache row, and a price watch
-- carries the hash itself.
CREATE OR REPLACE FUNCTION catalog_product_is_referenced(p_url_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM price_watches w WHERE w.url_hash = p_url_hash)
      OR EXISTS (
           SELECT 1
             FROM extraction_cache e
            WHERE e.url_hash = p_url_hash
              AND (   EXISTS (SELECT 1 FROM cart_items ci WHERE ci.extraction_cache_id = e.id)
                   OR EXISTS (SELECT 1 FROM orders o WHERE o.extraction_cache_id = e.id)
                   OR EXISTS (SELECT 1 FROM price_watches w2 WHERE w2.extraction_cache_id = e.id))
         );
$$;

REVOKE ALL ON FUNCTION catalog_product_is_referenced(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_product_is_referenced(text) TO service_role;

-- The rows the clean-up may delete, with what the app needs to name why.
-- The rules are the app's (src/features/catalog/services/catalog-cleanup.ts,
-- unit tested); this WHERE mirrors them with the same thresholds passed in, so
-- a batch is never filled with rows that are merely waiting for enrichment.
-- The app re-checks every row before asking for a delete.
-- `dup_rank` > 1 marks every copy after the best one of a listing (same store
-- and item id, or the same URL when the id is unknown): priced first, then the
-- most recently seen.
DROP FUNCTION IF EXISTS catalog_cleanup_candidates(timestamptz, timestamptz, timestamptz, int, text[], numeric, int, int);
DROP FUNCTION IF EXISTS catalog_cleanup_candidates(timestamptz, timestamptz, int, text[], numeric, int, int);

CREATE FUNCTION catalog_cleanup_candidates(
  p_seen_before timestamptz,
  p_grace_before timestamptz,
  p_max_attempts int,
  p_enrichable_stores text[],
  p_max_plausible_price numeric,
  p_max_ebay_title int,
  p_limit int DEFAULT 500
)
RETURNS TABLE (
  id uuid, store text, external_id text, product_url text, image_url text, title text,
  price_usd numeric, landed_ghs numeric, landed_priced_at timestamptz, landed_decline text,
  weight_lbs numeric, enrich_attempts int, first_seen_at timestamptz, last_seen_at timestamptz,
  dup_rank int, known_weight_miss boolean, referenced boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT p.*,
           row_number() OVER (
             PARTITION BY p.store, coalesce(p.external_id, regexp_replace(lower(p.product_url), '[?#].*$', ''))
             ORDER BY (p.landed_ghs IS NULL) ASC, p.last_seen_at DESC, p.id
           )::int AS dup_rank,
           EXISTS (SELECT 1 FROM catalog_weight_misses m WHERE m.url_hash = p.url_hash) AS known_weight_miss
      FROM catalog_products p
  )
  SELECT r.id, r.store, r.external_id, r.product_url, r.image_url, r.title,
         r.price_usd, r.landed_ghs, r.landed_priced_at, r.landed_decline,
         r.weight_lbs, r.enrich_attempts, r.first_seen_at, r.last_seen_at,
         r.dup_rank, r.known_weight_miss, catalog_product_is_referenced(r.url_hash) AS referenced
    FROM ranked r
   WHERE btrim(coalesce(r.title, '')) = ''
      OR r.product_url !~* '^https://'
      OR (r.image_url IS NOT NULL AND r.image_url !~* '^https://')
      OR r.dup_rank > 1
      OR r.price_usd > p_max_plausible_price
      OR (r.store = 'ebay' AND length(r.title) > p_max_ebay_title)
      OR r.price_usd IS NULL OR r.price_usd <= 0
      OR r.last_seen_at < p_seen_before
      OR (r.landed_ghs IS NULL AND r.landed_priced_at IS NOT NULL AND (
            (r.landed_decline = 'unpriceable' AND r.first_seen_at < p_grace_before)
         OR (r.landed_decline = 'needs_weight' AND (
                r.enrich_attempts >= p_max_attempts
             OR ((r.known_weight_miss OR NOT (r.store = ANY (coalesce(p_enrichable_stores, '{}'::text[]))))
                 AND r.first_seen_at < p_grace_before)))
         ))
   ORDER BY r.last_seen_at ASC, r.id
   LIMIT least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

REVOKE ALL ON FUNCTION catalog_cleanup_candidates(timestamptz, timestamptz, int, text[], numeric, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_cleanup_candidates(timestamptz, timestamptz, int, text[], numeric, int, int) TO service_role;

-- Delete the ids the app chose, re-checking references in the same statement
-- so a row that went into a bag since it was read is still kept. A row the
-- enrichment searched and found no weight for is remembered in
-- catalog_weight_misses on its way out. Returns the ids actually deleted.
CREATE OR REPLACE FUNCTION delete_catalog_products(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH gone AS (
    DELETE FROM catalog_products c
     WHERE c.id = ANY (p_ids)
       AND NOT catalog_product_is_referenced(c.url_hash)
    RETURNING c.id, c.url_hash, c.store, c.landed_decline, c.weight_lbs, c.enrich_attempts
  ),
  remembered AS (
    INSERT INTO catalog_weight_misses (url_hash, store)
    SELECT g.url_hash, g.store FROM gone g
     WHERE g.landed_decline = 'needs_weight' AND g.weight_lbs IS NULL AND g.enrich_attempts > 0
    ON CONFLICT (url_hash) DO UPDATE SET recorded_at = now()
  )
  SELECT g.id FROM gone g;
$$;

REVOKE ALL ON FUNCTION delete_catalog_products(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_catalog_products(uuid[]) TO service_role;

-- ── 5. The shop never shows an unpriced row ─────────────────────────────────
-- Return types gain `weight_lbs`, so these are dropped and recreated (a
-- changed RETURNS TABLE cannot be replaced in place) and their grants restated
-- exactly as 080 and 063 left them.
DROP FUNCTION IF EXISTS public.browse_catalog_products(text, text, text[], text[], numeric, numeric, numeric, text, int, int);

CREATE FUNCTION public.browse_catalog_products(
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
  total_count bigint, weight_lbs numeric
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
     WHERE p.landed_ghs IS NOT NULL
       AND (q.term IS NULL OR p.search @@ q.tsq OR extensions.similarity(p.title, q.term) > 0.15)
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
         count(*) OVER () AS total_count, m.weight_lbs
    FROM matched m
   ORDER BY
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

-- Facets count only what the shop can show.
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
     WHERE p.landed_ghs IS NOT NULL
       AND (q.term IS NULL OR p.search @@ q.tsq OR extensions.similarity(p.title, q.term) > 0.15)
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
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_rating
   GROUP BY width_bucket(m.landed_ghs, p_price_edges)
  UNION ALL
  SELECT 'rating', t.stars::text, count(*) FROM m
   CROSS JOIN (VALUES (4), (3)) AS t(stars)
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_price AND m.rating >= t.stars
   GROUP BY t.stars
  UNION ALL
  SELECT 'range', 'min', floor(min(m.landed_ghs))::bigint FROM m
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_rating
   HAVING count(*) > 0
  UNION ALL
  SELECT 'range', 'max', ceil(max(m.landed_ghs))::bigint FROM m
   WHERE m.f_cat AND m.f_store AND m.f_cond AND m.f_rating
   HAVING count(*) > 0;
$$;

REVOKE ALL ON FUNCTION public.catalog_shop_facets(text, text, text[], text[], numeric, numeric, numeric, numeric[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_shop_facets(text, text, text[], text[], numeric, numeric, numeric, numeric[]) TO service_role;

DROP FUNCTION IF EXISTS public.catalog_department_tops(int);

CREATE FUNCTION public.catalog_department_tops(p_per int DEFAULT 4)
RETURNS TABLE (
  id uuid, store text, external_id text, product_url text, title text, image_url text,
  price_usd numeric, currency text, rating numeric, review_count int, category text,
  last_seen_at timestamptz, landed_ghs numeric, condition_group text,
  category_count bigint, shelf_position int, weight_lbs numeric
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
             ORDER BY p.popularity DESC NULLS LAST, p.rating DESC NULLS LAST, p.landed_ghs ASC, p.id
           )::int AS shelf_position
      FROM catalog_products p
     WHERE p.category IS NOT NULL AND btrim(p.category) <> ''
       AND p.landed_ghs IS NOT NULL
  )
  SELECT r.id, r.store, r.external_id, r.product_url, r.title, r.image_url,
         r.price_usd, r.currency, r.rating, r.review_count, r.category,
         r.last_seen_at, r.landed_ghs, r.condition_group, r.category_count, r.shelf_position,
         r.weight_lbs
    FROM ranked r
   WHERE r.shelf_position <= least(greatest(coalesce(p_per, 4), 1), 12)
   ORDER BY r.category_count DESC, r.category ASC, r.shelf_position ASC;
$$;

REVOKE ALL ON FUNCTION public.catalog_department_tops(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_department_tops(int) TO service_role;

DROP FUNCTION IF EXISTS search_catalog_products(text, int, text);

CREATE FUNCTION search_catalog_products(
  p_q text,
  p_limit int DEFAULT 12,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, store text, external_id text, product_url text, title text, image_url text,
  price_usd numeric, currency text, rating numeric, review_count int, category text,
  last_seen_at timestamptz, rank real, total_count bigint, weight_lbs numeric
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
           p.weight_lbs,
           (ts_rank(p.search, q.tsq) + extensions.similarity(p.title, p_q))::real AS rank
    FROM catalog_products p, q
    WHERE p.landed_ghs IS NOT NULL
      AND (p.search @@ q.tsq OR extensions.similarity(p.title, p_q) > 0.15)
      AND (p_category IS NULL OR p.category = p_category)
  )
  SELECT m.id, m.store, m.external_id, m.product_url, m.title, m.image_url,
         m.price_usd, m.currency, m.rating, m.review_count, m.category, m.last_seen_at,
         m.rank, count(*) OVER () AS total_count, m.weight_lbs
  FROM matched m
  ORDER BY m.rank DESC, m.price_usd ASC NULLS LAST
  LIMIT least(greatest(p_limit, 1), 120);
$$;

-- 061 keeps this one deliberately public (signed-out visitors search).
GRANT EXECUTE ON FUNCTION search_catalog_products(text, int, text) TO anon, authenticated, service_role;

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
     AND p.landed_ghs IS NOT NULL
   GROUP BY p.category
   ORDER BY count(*) DESC, p.category ASC;
$$;

-- ── Seed queries for the new stores ─────────────────────────────────────────
-- Walmart: 045's list, so every Tomame category has a Walmart shelf too.
INSERT INTO catalog_queries (store, category, query, priority, source)
SELECT 'walmart', v.category, v.query, v.priority, 'seed'
FROM (VALUES
  ('Cell Phones & Accessories',      'unlocked smartphone',        10),
  ('Cell Phones & Accessories',      'iphone',                     10),
  ('Headphones',                     'wireless earbuds',            9),
  ('Headphones',                     'noise cancelling headphones', 8),
  ('Computers',                      'laptop',                      9),
  ('Computers',                      'gaming laptop',               7),
  ('Wearable Technology',            'smartwatch',                  8),
  ('Video Games',                    'playstation 5 console',       8),
  ('Video Games',                    'nintendo switch',             7),
  ('TV & Video',                     '55 inch 4k smart tv',         7),
  ('Camera & Photo',                 'mirrorless camera',           6),
  ('Smart Home',                     'bluetooth speaker',           7),
  ('Smart Home',                     'smart plug',                  4),
  ('Electronics',                    'power bank',                  7),
  ('Electronics',                    'tablet',                      6),
  ('Appliances',                     'air fryer',                   7),
  ('Appliances',                     'blender',                     5),
  ('Kitchen & Dining',               'cookware set',                5),
  ('Home & Kitchen',                 'vacuum cleaner',              5),
  ('Beauty & Personal Care',         'hair dryer',                  5),
  ('Skin Care',                      'moisturizer',                 4),
  ('Fragrance',                      'perfume',                     6),
  ('Hair Care',                      'hair straightener',           4),
  ('Vitamins & Dietary Supplements', 'multivitamin',                4),
  ('Exercise & Fitness',             'dumbbell set',                4),
  ('Men''s Shoes',                   'men running shoes',           6),
  ('Women''s Shoes',                 'women sneakers',              6),
  ('Men''s Clothing',                'men hoodie',                  4),
  ('Women''s Clothing',              'women dress',                 4),
  ('Handbags & Wallets',             'women handbag',               5),
  ('Watches',                        'men watch',                   6),
  ('Luggage & Travel Gear',          'carry on luggage',            5),
  ('Toys & Games',                   'lego set',                    5),
  ('Baby',                           'baby stroller',               4),
  ('Automotive',                     'car dash cam',                5),
  ('Car Electronics & Accessories',  'car phone holder',            3),
  ('Tools & Home Improvement',       'cordless drill',              5),
  ('Office Electronics',             'wireless printer',            4),
  ('Office Products',                'office chair',                4),
  ('Musical Instruments',            'acoustic guitar',             3),
  ('Pet Supplies',                   'dog harness',                 3),
  ('Books',                          'bestseller books',            2)
) AS v(category, query, priority)
WHERE EXISTS (SELECT 1 FROM category_pricing_map m WHERE m.tomame_category = v.category)
ON CONFLICT DO NOTHING;

-- Etsy: handmade and personalised goods, where Etsy is the store people mean.
-- Nike: its own shoes and clothing. Neither is searched for categories it
-- does not sell.
INSERT INTO catalog_queries (store, category, query, priority, source)
SELECT v.store, v.category, v.query, v.priority, 'seed'
FROM (VALUES
  ('etsy', 'Handbags & Wallets',     'leather wallet',            6),
  ('etsy', 'Handbags & Wallets',     'leather tote bag',          5),
  ('etsy', 'Jewelry',                'gold necklace',             6),
  ('etsy', 'Jewelry',                'personalized bracelet',     5),
  ('etsy', 'Women''s Clothing',      'linen dress',               4),
  ('etsy', 'Home & Kitchen',         'ceramic mug',               4),
  ('etsy', 'Toys & Games',           'wooden toys',               4),
  ('etsy', 'Baby',                   'personalized baby blanket', 4),
  ('etsy', 'Arts, Crafts & Sewing',  'embroidery kit',            3),
  ('etsy', 'Pet Supplies',           'personalized dog collar',   3),
  ('nike', 'Men''s Shoes',           'men running shoes',         7),
  ('nike', 'Men''s Shoes',           'air force 1',               7),
  ('nike', 'Women''s Shoes',         'women running shoes',       7),
  ('nike', 'Women''s Shoes',         'women sneakers',            6),
  ('nike', 'Men''s Clothing',        'men hoodie',                4),
  ('nike', 'Women''s Clothing',      'women leggings',            4),
  ('nike', 'Kids'' Shoes',           'kids shoes',                4)
) AS v(store, category, query, priority)
WHERE EXISTS (SELECT 1 FROM category_pricing_map m WHERE m.tomame_category = v.category)
ON CONFLICT DO NOTHING;

-- ── Cron callers ────────────────────────────────────────────────────────────
-- As run_catalog_scrape() (045): vault first, GUC second, warn when app_url is
-- unset rather than installing a job that silently never calls the app.
CREATE OR REPLACE FUNCTION run_catalog_job(p_path text) RETURNS void AS $$
DECLARE
  v_app_url     text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_app_url FROM vault.decrypted_secrets WHERE name = 'app_url';
  SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  v_app_url := coalesce(v_app_url, current_setting('app.settings.app_url', true));
  v_cron_secret := coalesce(v_cron_secret, current_setting('app.settings.cron_secret', true));

  IF v_app_url IS NULL OR v_app_url = '' THEN
    RAISE WARNING 'app_url not configured: set vault secret "app_url" (or app.settings.app_url)';
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := v_app_url || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce(v_cron_secret, '')),
    timeout_milliseconds := 60000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION run_catalog_enrich() RETURNS void AS $$
  SELECT run_catalog_job('/api/cron/catalog-enrich');
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION run_catalog_cleanup() RETURNS void AS $$
  SELECT run_catalog_job('/api/cron/catalog-cleanup');
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- As 061: a cron trigger must not be callable over RPC by any API role.
REVOKE ALL ON FUNCTION run_catalog_job(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION run_catalog_enrich() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION run_catalog_cleanup() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION run_catalog_scrape() FROM PUBLIC, anon, authenticated, service_role;

-- The scrape goes from hourly to every 15 minutes: one search call per run,
-- about 2,900 runs a month, capped by job_budgets (src/config/catalog.ts).
SELECT cron.unschedule('catalog-scrape')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'catalog-scrape');
SELECT cron.schedule('catalog-scrape', '5,20,35,50 * * * *', $$ SELECT run_catalog_scrape(); $$);

-- One product call per run, every 10 minutes, offset off the scrape.
SELECT cron.unschedule('catalog-enrich')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'catalog-enrich');
SELECT cron.schedule('catalog-enrich', '8-59/10 * * * *', $$ SELECT run_catalog_enrich(); $$);

-- Daily at 04:10 UTC, fired four times in the hour: each run deletes at most
-- one batch and the later ones are no-ops once the backlog is gone.
SELECT cron.unschedule('catalog-cleanup')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'catalog-cleanup');
SELECT cron.schedule('catalog-cleanup', '10,25,40,55 4 * * *', $$ SELECT run_catalog_cleanup(); $$);

-- Retention for the weight misses: a listing's details change, so a miss is
-- forgotten after 90 days and the product may be looked up again.
SELECT cron.unschedule('cleanup-catalog-weight-misses')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-catalog-weight-misses');
SELECT cron.schedule('cleanup-catalog-weight-misses', '5 4 * * *', $$
  DELETE FROM catalog_weight_misses WHERE recorded_at < now() - interval '90 days';
$$);

COMMIT;
