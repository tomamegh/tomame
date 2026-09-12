-- LOCAL DEVELOPMENT ONLY.
--
-- `supabase db reset` applies this after the migrations; `supabase db push` does
-- NOT send it to a hosted project. Nothing here should ever run in production.
--
-- Why it exists: hosted Supabase configures ALTER DEFAULT PRIVILEGES on the
-- `public` schema so that tables created by migrations are automatically reachable
-- by anon / authenticated / service_role, with RLS doing the actual gatekeeping.
-- A local `supabase start` stack does not set those defaults up (verified: `anon`
-- has SELECT in realtime/storage/supabase_functions but none in public, and \ddp
-- returns no rows). The result is that every table created before migration 036 —
-- orders, payments, exchange_rates, pricing_constants, policies — throws
-- "permission denied" locally while working fine on hosted.
--
-- This file closes that gap so local behaves like hosted. RLS is still enforced:
-- a GRANT only makes the table addressable, the policies decide which rows come
-- back. Tables with RLS enabled and no policies stay effectively service-role only.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL    ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- And for anything created later in the session.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL    ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL    ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- A USD→GHS rate so the FX pill and pricing render locally. The hosted project
-- gets real rates from the exchange-rate cron; local has no such job.
INSERT INTO exchange_rates (base_currency, target_currency, rate, provider, fetched_at)
VALUES ('USD', 'GHS', 14.43, 'local-seed', now())
ON CONFLICT (base_currency, target_currency) DO UPDATE SET rate = EXCLUDED.rate;
