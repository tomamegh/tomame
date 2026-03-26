-- Scope extraction cache to the user who performed the scrape.
-- The same URL scraped by different users gets separate cache entries.

alter table extraction_cache
  add column if not exists user_id uuid not null default '00000000-0000-0000-0000-000000000000'
  references auth.users(id) on delete cascade;

-- Replace the old url_hash-only unique constraint with (user_id, url_hash)
alter table extraction_cache drop constraint if exists extraction_cache_url_hash_key;
drop index if exists idx_extraction_cache_url_hash;
create unique index idx_extraction_cache_user_url on extraction_cache (user_id, url_hash);

-- Remove the default after backfill (new rows must always supply user_id)
alter table extraction_cache alter column user_id drop default;
