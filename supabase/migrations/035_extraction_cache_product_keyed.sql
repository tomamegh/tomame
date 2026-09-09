-- Extraction pipeline rework.
--
-- 1. extraction_cache becomes PRODUCT-keyed (url_hash only). Ten customers
--    pasting the same link share one extraction. user_id is kept as "who
--    requested it" but no longer scopes the row.
-- 2. Rows referenced by an order are never hard-deleted: the order's pricing
--    was computed from that snapshot and the server re-reads it at intake.
-- 3. Two pricing constants the calculator now reads.

-- ── 1. Re-key ────────────────────────────────────────────────────────────────

alter table extraction_cache alter column user_id drop not null;

alter table extraction_cache
  add column if not exists complete   boolean     not null default false,
  add column if not exists source     text,
  add column if not exists updated_at timestamptz not null default now();

-- Collapse duplicates: keep the newest row per url_hash, repoint orders to it.
with ranked as (
  select id, url_hash,
         first_value(id) over (partition by url_hash order by created_at desc, id) as keeper
  from extraction_cache
),
dupes as (
  select id, keeper from ranked where id <> keeper
)
update orders o
set extraction_cache_id = d.keeper
from dupes d
where o.extraction_cache_id = d.id;

delete from extraction_cache ec
using (
  select id from (
    select id,
           row_number() over (partition by url_hash order by created_at desc, id) as rn
    from extraction_cache
  ) r where rn > 1
) d
where ec.id = d.id;

drop index if exists idx_extraction_cache_user_url;
create unique index if not exists idx_extraction_cache_url_hash on extraction_cache (url_hash);
create index if not exists idx_extraction_cache_user_id on extraction_cache (user_id) where user_id is not null;

-- ── 2. Cleanup job: invalidate on expiry, delete only unreferenced, old rows ──

do $$
begin
  perform cron.unschedule('cleanup-extraction-cache');
exception when others then
  -- job did not exist on this database
  null;
end $$;

select cron.schedule(
  'cleanup-extraction-cache',
  '*/10 * * * *',
  $$
    update extraction_cache
    set is_valid = false
    where is_valid = true and expires_at < now();

    delete from extraction_cache ec
    where ec.expires_at < now() - interval '7 days'
      and not exists (select 1 from orders o where o.extraction_cache_id = ec.id);
  $$
);

-- ── 3. Pricing constants ─────────────────────────────────────────────────────

insert into pricing_constants (key, value, label, description, unit) values
  ('minimum_chargeable_weight_lbs', 1.00, 'Minimum Chargeable Weight',
   'Floor applied to a listed item weight before a weight-based freight formula runs', 'lb'),
  ('default_value_fee_pct', 0.05, 'Default Value Fee',
   'Service fee applied when a fixed-freight item matches but its category has no pricing group', '%')
on conflict (key) do nothing;
