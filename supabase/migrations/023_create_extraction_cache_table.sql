-- Extraction cache: store scrape results for 30 minutes to avoid redundant calls
-- Keyed by SHA-256 hash of the normalized URL

create table if not exists extraction_cache (
  id          uuid primary key default gen_random_uuid(),
  url_hash    text not null unique,
  product_url text not null,
  result      jsonb not null,
  is_valid    boolean not null default true,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Fast lookup by hash
create index if not exists idx_extraction_cache_url_hash on extraction_cache (url_hash);

-- Index for cleanup job
create index if not exists idx_extraction_cache_expires_at on extraction_cache (expires_at)
  where is_valid = true;

-- RLS: only service role accesses this table (server-side only)
alter table extraction_cache enable row level security;

-- No RLS policies = no client access. Only service-role (admin) client can read/write.

-- ── Auto-cleanup via pg_cron ────────────────────────────────────────────────
-- Enable pg_cron (no-op if already enabled on hosted Supabase)
create extension if not exists pg_cron;

-- Every 10 minutes: invalidate expired rows and hard-delete old ones.
select cron.schedule(
  'cleanup-extraction-cache',
  '*/10 * * * *',
  $$
    update extraction_cache
    set is_valid = false
    where is_valid = true and expires_at < now();

    delete from extraction_cache
    where expires_at < now() - interval '30 minutes';
  $$
);
