-- Migration 085: the store's own shipping (seller → our warehouse) on a bag.
--
-- WHY. eBay sellers charge their own shipping to our US/UK warehouse, and the
-- quote used to drop it. Each order's `pricing` jsonb now carries it
-- (`store_shipping_usd`, inside `total_ghs`; see src/lib/pricing/calculator.ts),
-- so a bag's total already includes it. This column is the group-level roll-up
-- beside `subtotal_usd` / `tax_usd` / `fee_usd`, so "How the total was built"
-- adds up again.
--
-- Additive, defaulted: existing groups read 0, which is what they charged.
-- Apply BEFORE deploying the code that selects it (order-groups.ts COLUMNS).

ALTER TABLE order_groups
  ADD COLUMN IF NOT EXISTS store_shipping_usd NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN order_groups.store_shipping_usd IS
  'Σ orders.pricing.store_shipping_usd: the stores'' own shipping to our warehouse, USD. Already inside total_ghs.';
