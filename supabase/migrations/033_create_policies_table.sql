-- Dynamic, admin-editable legal policies surfaced on the public /policies page.
-- Service-role only: no RLS policies are defined, mirroring extraction_cache.
create table if not exists policies (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  label          text not null,
  content        text not null default '',
  effective_date text,
  last_updated   timestamptz not null default now(),
  is_published   boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table policies enable row level security;
-- No RLS policies = service role only (same as extraction_cache).
