-- Link orders to the extraction cache entry they were created from.
-- The order copies key product fields (name, image, price) for durability,
-- but this FK gives traceability back to the full scrape result.

alter table orders
  add column if not exists extraction_cache_id uuid references extraction_cache(id)
    on delete set null;

create index if not exists idx_orders_extraction_cache_id
  on orders (extraction_cache_id)
  where extraction_cache_id is not null;
