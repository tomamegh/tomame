-- Migration 045: product catalogue — pre-scraped category search results, the
-- query list that drives the scraper, and a per-job monthly budget.
--
-- WHY. Customers usually paste a store link. The reverse is wanted too: type a
-- product with no link and see the cheapest options Tomame has already seen on
-- Amazon and eBay. Live search on every keystroke is impossible on the vendor's
-- free tier (~1000 ScraperAPI requests a month, shared with the paste flow), so
-- a background job scrapes ONE category search page per run into
-- catalog_products, and the search endpoint reads only from that table.
--
-- WHY A BUDGET TABLE. A cron that fires hourly and a vendor that bills per call
-- is a bill with no ceiling. job_budgets records (job, YYYY-MM) → used/cap; the
-- job reads it before every vendor call and increments it after, success or
-- failure, because a failed call still costs a credit. The cap for
-- catalog-scrape defaults to 500 (src/config/catalog.ts) so the paste flow keeps
-- the other half of the month's credits.
--
-- WHY QUERIES ARE ROWS. Nothing static: the search phrases live in
-- catalog_queries (seeded below from Tomame's own category list, source='seed')
-- so an admin can add, retire or reprioritise them without a deploy.
--
-- PRICES. price_usd is the store's listed price. The landed GH₵ figure is
-- computed at search time by the pricing engine and never stored — the
-- exchange rate and fee schedule change under it.
--
-- ACCESS. catalog_products is store-public data: anon + authenticated SELECT,
-- service-role write. catalog_queries and job_budgets are operational: service
-- role only, plus admin read for a later review screen. GRANTs are explicit so
-- local and hosted behave identically (see migration 036).

create extension if not exists pg_trgm with schema extensions;

-- ── catalog_queries — what the scraper searches for ──────────────────────────
create table if not exists catalog_queries (
  id                   uuid primary key default gen_random_uuid(),
  store                text not null check (store in ('amazon', 'ebay')),
  category             text not null,              -- Tomame category (TomameCategory value)
  query                text not null,
  priority             int not null default 0,
  is_active            boolean not null default true,
  source               text not null check (source in ('seed', 'admin')),
  last_run_at          timestamptz,
  last_result_count    int,
  consecutive_failures int not null default 0,
  next_run_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (store, query)
);

-- The claim query: due, active, oldest first.
create index if not exists idx_catalog_queries_due
  on catalog_queries (next_run_at asc, priority desc)
  where is_active;

alter table catalog_queries enable row level security;
grant all on catalog_queries to service_role;
grant select on catalog_queries to authenticated;

create policy "catalog_queries admin read"
  on catalog_queries for select to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ── catalog_products — one row per store listing ─────────────────────────────
-- url_hash uses the same canonicalisation + sha256 as extraction_cache
-- (src/features/extraction/url.ts → hashUrl) so a catalogue hit and a pasted
-- link agree on identity. external_id is the ASIN / eBay item id.
create table if not exists catalog_products (
  id            uuid primary key default gen_random_uuid(),
  store         text not null check (store in ('amazon', 'ebay')),
  external_id   text,
  product_url   text not null,
  url_hash      text not null unique,
  title         text not null,
  image_url     text,
  price_usd     numeric,
  currency      text,
  rating        numeric,
  review_count  int,
  category      text,
  query_id      uuid references catalog_queries(id) on delete set null,
  raw           jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (to_tsvector('english', coalesce(title, ''))) stored
);

create index if not exists idx_catalog_products_search on catalog_products using gin (search);
create index if not exists idx_catalog_products_title_trgm on catalog_products using gin (title extensions.gin_trgm_ops);
create index if not exists idx_catalog_products_category_price on catalog_products (category, price_usd);
create unique index if not exists idx_catalog_products_store_external
  on catalog_products (store, external_id) where external_id is not null;

alter table catalog_products enable row level security;
grant all on catalog_products to service_role;
grant select on catalog_products to anon, authenticated;

create policy "catalog_products public read"
  on catalog_products for select to anon, authenticated
  using (true);

-- ── job_budgets — monthly vendor-call ceiling per job ────────────────────────
create table if not exists job_budgets (
  job        text not null,
  period     text not null,                        -- 'YYYY-MM' (UTC)
  used       int not null default 0,
  cap        int not null,
  updated_at timestamptz not null default now(),
  primary key (job, period)
);

alter table job_budgets enable row level security;
grant all on job_budgets to service_role;
grant select on job_budgets to authenticated;

create policy "job_budgets admin read"
  on job_budgets for select to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ── functions ────────────────────────────────────────────────────────────────

-- Claim the next due query and stamp it in the same statement, so two runs that
-- overlap (pg_net retry, manual trigger during the hourly tick) cannot both
-- take the same row: `for update skip locked` makes the second caller see the
-- next row or nothing.
create or replace function claim_next_catalog_query(p_now timestamptz default now(), p_requery_hours int default 24)
returns setof catalog_queries
language sql
security definer
set search_path = public
as $$
  update catalog_queries q
  set last_run_at = p_now,
      next_run_at = p_now + make_interval(hours => p_requery_hours),
      updated_at  = p_now
  where q.id = (
    select c.id
    from catalog_queries c
    where c.is_active and c.next_run_at <= p_now
    order by c.next_run_at asc, c.priority desc
    limit 1
    for update skip locked
  )
  returning q.*;
$$;

revoke all on function claim_next_catalog_query(timestamptz, int) from public, anon, authenticated;
grant execute on function claim_next_catalog_query(timestamptz, int) to service_role;

-- Atomic used += n; creates the period row with the caller's default cap on
-- first use so a new month never needs a separate insert.
create or replace function increment_job_budget(p_job text, p_period text, p_n int, p_default_cap int)
returns job_budgets
language sql
security definer
set search_path = public
as $$
  insert into job_budgets (job, period, used, cap)
  values (p_job, p_period, p_n, p_default_cap)
  on conflict (job, period) do update
    set used = job_budgets.used + excluded.used,
        updated_at = now()
  returning *;
$$;

revoke all on function increment_job_budget(text, text, int, int) from public, anon, authenticated;
grant execute on function increment_job_budget(text, text, int, int) to service_role;

-- Full-text first (websearch syntax: quotes, -exclusions), trigram similarity
-- as the typo/partial-word fallback. Rank blends both so an exact phrase match
-- outranks a fuzzy one. Public: reads only the public-read table.
create or replace function search_catalog_products(p_q text, p_limit int default 12)
returns table (
  id uuid, store text, external_id text, product_url text, title text, image_url text,
  price_usd numeric, currency text, rating numeric, review_count int, category text,
  last_seen_at timestamptz, rank real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select websearch_to_tsquery('english', p_q) as tsq)
  select p.id, p.store, p.external_id, p.product_url, p.title, p.image_url,
         p.price_usd, p.currency, p.rating, p.review_count, p.category, p.last_seen_at,
         (ts_rank(p.search, q.tsq) + extensions.similarity(p.title, p_q))::real as rank
  from catalog_products p, q
  where p.search @@ q.tsq or extensions.similarity(p.title, p_q) > 0.15
  order by rank desc, p.price_usd asc nulls last
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function search_catalog_products(text, int) to anon, authenticated, service_role;

-- ── seed queries ─────────────────────────────────────────────────────────────
-- One or two shopper-phrased searches per Tomame category, for both stores.
-- Guarded by category_pricing_map so a category the pricing engine cannot
-- price is never seeded. Admin rows (source='admin') are added later via the
-- table; re-running this seed never touches them (on conflict do nothing).
insert into catalog_queries (store, category, query, priority, source)
select s.store, v.category, v.query, v.priority, 'seed'
from (values
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
) as v(category, query, priority)
cross join (values ('amazon'), ('ebay')) as s(store)
where exists (select 1 from category_pricing_map m where m.tomame_category = v.category)
on conflict (store, query) do nothing;

-- ── cron caller ──────────────────────────────────────────────────────────────
-- Same shape as recheck_price_watches() (042): security definer so the cron
-- owner can read the database-level settings; warn-and-return when app_url is
-- unset. One run = one vendor call, so 60 s covers the slowest eBay search
-- (25 s measured) with room for the upsert.
create extension if not exists pg_net with schema extensions;

create or replace function run_catalog_scrape() returns void as $$
declare
  v_app_url text;
  v_cron_secret text;
begin
  v_app_url := current_setting('app.settings.app_url', true);
  v_cron_secret := current_setting('app.settings.cron_secret', true);

  if v_app_url is null or v_app_url = '' then
    raise warning 'app.settings.app_url not configured';
    return;
  end if;

  perform net.http_get(
    url := v_app_url || '/api/cron/catalog-scrape',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
    ),
    timeout_milliseconds := 60000
  );
end;
$$ language plpgsql security definer;

select cron.unschedule('catalog-scrape')
  where exists (select 1 from cron.job where jobname = 'catalog-scrape');

-- Hourly at :05 — off the exchange-rate refreshes (top of the hour, 026) and
-- the price-watch run (06:00, 042).
select cron.schedule(
  'catalog-scrape',
  '5 * * * *',
  $$ select run_catalog_scrape(); $$
);
