-- Close two doors the publishable key opened straight into the database (094).
--
-- Found in the review after the 2026-10-16 outage, when a scraper loaded the
-- shop ~27,000 times overnight. The key every browser carries could still:
--
-- 1. Call run_whatsapp_dispatch(). It is SECURITY DEFINER and fires the
--    WhatsApp cron route through pg_net with the cron secret. 079 created it
--    after 061 locked the other run_* functions down, so it kept Postgres's
--    default EXECUTE for PUBLIC: anyone could fire the job on repeat. Only
--    pg_cron (as postgres) calls it.
--
-- 2. Read catalog_products and call catalog_categories() and
--    search_catalog_products() directly on PostgREST, around the Vercel
--    firewall and the app's shared cache — the same reads that took the
--    database down, aimed at it with no front door. Every app read of the
--    catalogue goes through the service-role client (src/db/queries/catalog.ts),
--    so anon needs none of it. Signed-in users keep their existing grants.

REVOKE ALL ON FUNCTION public.run_whatsapp_dispatch() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.catalog_categories() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_catalog_products(text, integer, text) FROM PUBLIC, anon;

-- anon also held INSERT/UPDATE/DELETE here; RLS had no write policy for it, but
-- the grant had no reason to exist either.
REVOKE ALL ON TABLE public.catalog_products FROM anon;
