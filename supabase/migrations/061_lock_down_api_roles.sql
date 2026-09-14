-- Migration 061: lock down what the API roles can do (security review, 2026-09-14).
--
-- Findings DB-1 to DB-5 in docs/SECURITY-REVIEW-2026-09-14-db.md. Each block
-- is idempotent, so it is safe on an environment where part of it already holds.

-- ── DB-1 (critical): never take a role from client-writable signup metadata ───
-- handle_new_user() (001) copied raw_user_meta_data->>'role' into profiles.role.
-- That metadata is the `data` object of the public /auth/v1/signup call, so any
-- visitor could register as admin; the access-token hook would then stamp the
-- claim into their JWT. Nothing legitimate ever used that branch: the seed
-- script and the admin screens set the role through the service role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, role)
  VALUES (
    NEW.id,
    NULLIF(left(NEW.raw_user_meta_data ->> 'first_name', 255), ''),
    NULLIF(left(NEW.raw_user_meta_data ->> 'last_name', 255), ''),
    'user'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ── DB-2 (high): the cron trigger functions were callable by anyone over RPC ──
-- SECURITY DEFINER with the schema's default EXECUTE grant: POST /rest/v1/rpc/run_*
-- with the publishable key fired the real route with the real CRON_SECRET, at
-- any rate. pg_cron runs them as their owner (postgres), which needs no grant.
REVOKE ALL ON FUNCTION public.run_reconcile_payments()  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_catalog_scrape()      FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_sweep_extractions()   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recheck_price_watches()   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_exchange_rates()  FROM PUBLIC, anon, authenticated, service_role;
-- Trigger bodies: not callable directly, but there is no reason to expose them.
REVOKE ALL ON FUNCTION public.update_orders_updated_at()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_order_deliveries_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_user_updated_at()             FROM PUBLIC, anon, authenticated;
-- Stop the next function inheriting the same default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
-- Kept on purpose: is_admin() (evaluated inside policies as the caller) and the
-- public catalogue readers search_catalog_products() and catalog_categories().

-- ── DB-3 (high): customers could flood the paid queues ───────────────────────
-- authenticated held INSERT/UPDATE/DELETE with owner FOR ALL policies on
-- extraction_requests and price_watches: 500 pending paste jobs or 500 watches
-- in one request, and a job's attempts reset to 0 by its owner. The app writes
-- both only through the service role, so no code changes.
REVOKE INSERT, UPDATE, DELETE ON public.extraction_requests FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.price_watches       FROM authenticated, anon;
DROP POLICY IF EXISTS "extraction_requests owner write" ON public.extraction_requests;
DROP POLICY IF EXISTS "price_watches owner write"       ON public.price_watches;
-- Same shape on store_category_map (043); admin corrections use the service role too.
REVOKE UPDATE ON public.store_category_map FROM authenticated;
DROP POLICY IF EXISTS "store_category_map admin correct" ON public.store_category_map;

-- ── DB-4 (medium): the access-token hook is a role oracle if the API roles can run it
-- The hook migration revoked this; the local stack still had it granted. Only
-- GoTrue (supabase_auth_admin) may call it. Idempotent.
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ── DB-5 (medium): TRUNCATE ignores RLS and was granted to the API roles ─────
-- Not reachable through PostgREST today, which only issues row verbs, but the
-- append-only promise on audit_logs was one grant away from a one-line wipe.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', t.tablename);
    IF current_setting('server_version_num')::int >= 170000 THEN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon, authenticated', t.tablename);
    END IF;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
-- The supabase_admin default is where new tables get their GRANT ALL from; it
-- needs a superuser, which the hosted `postgres` role is not. Best effort.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'could not alter supabase_admin default privileges (needs superuser); new tables still need explicit REVOKEs';
END $$;
