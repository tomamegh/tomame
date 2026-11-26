-- 142: the size, colour or other option the customer is buying.
--
-- Most stores do not say which size a pasted link means (eBay, Amazon, Walmart,
-- SKIMS listed no size on ~90% of quotes in the 30 days to 2026-11-26), so the
-- quote and the bag ask, and staff buy from the answer. Shape: {"Size": "M",
-- "Colour": "Navy"}. Validated in the app against the extraction snapshot
-- (item-options.ts); null on lines and orders from before this, and on items
-- with no options. Existing RLS on both tables covers the new columns.

alter table public.cart_items add column if not exists chosen_options jsonb;
alter table public.orders add column if not exists chosen_options jsonb;

comment on column public.cart_items.chosen_options is 'Size/colour/other options the customer chose for this line, e.g. {"Size":"M"}. Null = none asked or not yet answered.';
comment on column public.orders.chosen_options is 'Size/colour/other options the customer is buying, copied from the bag line at checkout. Staff buy from this.';
