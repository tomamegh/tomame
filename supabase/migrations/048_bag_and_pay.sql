-- Migration 048: the bag (Phase 4) — carts, consolidation boxes, delivery
-- addresses and order groups, plus the columns that tie orders and payments to
-- them.
--
-- WHAT A CART IS. The customer's open bag: one row per viewer with
-- status = 'open'. A signed-out visitor owns it through the server-minted
-- `tm_quote_session` cookie (`session_id`), a customer through `user_id` — the
-- same two identities a quote lock has (044). On the first signed-in request the
-- session's cart is ADOPTED onto the user, or MERGED into the user's own open
-- cart when both exist (`status = 'merged'` on the source). Checkout flips the
-- cart to 'checked_out' and records the order group it became.
--
-- WHAT A LINE IS. `cart_items` names an extraction_cache row (the product, the
-- server-owned price source), a quantity and the customer's note. `pricing` is
-- the breakdown at add-to-bag time and is INFORMATIONAL: every render re-prices
-- the line from the live snapshot under the viewer's rate lock (lower of locked
-- and live), and checkout prices again. `quote_lock_id` remembers which lock the
-- line was quoted under so checkout can consume it. `gap_price_usd` and
-- `gap_origin_country` carry the two customer gap-fillers the quote screen
-- allows only when the extraction left that gap (order-intake honours them
-- solely in that case and flags the order for review).
--
-- WHAT A BOX IS. `consolidation_boxes` is the packing unit: one open box per
-- region per departure, holding `capacity_lbs` (default from
-- pricing_constants.box_capacity_lbs) of chargeable weight. Capacity has no
-- pricing meaning on its own — freight stays per line — it is the unit the
-- consolidation saving (pricing_constants.consolidation_saving_pct, share of the
-- box's freight when it holds two or more lines) is computed over, and the unit
-- an admin later closes and flies. `departs_at` comes from
-- regions.departure_weekday, never from a literal.
--
-- WHAT A GROUP IS. `order_groups` is what one payment buys: N one-product orders
-- (orders.order_group_id) created together at checkout, one delivery address,
-- one delivery fee (the zone's fee_ghs, charged once per group), the boxes'
-- consolidation saving, and the total Paystack is asked for in pesewas.
-- `payments.order_group_id` makes the payment ↔ orders join a real column.
--
-- WRITES ARE SERVICE-ROLE ONLY on every table here. Customers read their own
-- rows through RLS. GRANTs are explicit (036 explains why).

-- ── regions: when a box leaves ─────────────────────────────────────────────────
ALTER TABLE regions
  ADD COLUMN IF NOT EXISTS departure_weekday      INT CHECK (departure_weekday BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS departure_cutoff_hours INT NOT NULL DEFAULT 24 CHECK (departure_cutoff_hours >= 0);
COMMENT ON COLUMN regions.departure_weekday IS '0 = Sunday … 6 = Saturday. The weekday a consolidation box flies from this region. Null = no scheduled departures.';
UPDATE regions SET departure_weekday = 5 WHERE code = 'USA' AND departure_weekday IS NULL;

-- ── consolidation_boxes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consolidation_boxes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code   TEXT NOT NULL REFERENCES regions(code),
  label         TEXT,
  capacity_lbs  NUMERIC NOT NULL CHECK (capacity_lbs > 0),
  cutoff_at     TIMESTAMPTZ,
  departs_at    TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'in_transit', 'landed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE consolidation_boxes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON consolidation_boxes TO authenticated;
GRANT ALL ON consolidation_boxes TO service_role;
-- A box is visible to anyone who has a line or an order in it; admins see all.
CREATE POLICY "consolidation_boxes admin read"
  ON consolidation_boxes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE INDEX IF NOT EXISTS idx_consolidation_boxes_open
  ON consolidation_boxes (region_code, departs_at) WHERE status = 'open';

-- ── delivery_addresses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_addresses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'door' CHECK (kind IN ('door', 'pickup')),
  recipient_name    TEXT NOT NULL,
  phone             TEXT NOT NULL,
  line1             TEXT NOT NULL,
  line2             TEXT,
  area              TEXT,
  city              TEXT NOT NULL,
  region            TEXT,
  delivery_zone_id  UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
  digital_address   TEXT,
  is_default        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE delivery_addresses ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON delivery_addresses TO authenticated;
GRANT ALL ON delivery_addresses TO service_role;
CREATE POLICY "delivery_addresses owner read"
  ON delivery_addresses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_addresses_user ON delivery_addresses (user_id, is_default DESC, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_addresses_default
  ON delivery_addresses (user_id) WHERE is_default;

-- ── order_groups ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_groups (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_id                UUID REFERENCES payments(id) ON DELETE SET NULL,
  delivery_address_id       UUID REFERENCES delivery_addresses(id) ON DELETE SET NULL,
  delivery_zone_id          UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
  -- Snapshot of the address at checkout: the order's "Deliver to" must not move
  -- when the customer later edits their address book.
  delivery_address          JSONB,
  item_count                INT NOT NULL CHECK (item_count > 0),
  subtotal_usd              NUMERIC NOT NULL,
  tax_usd                   NUMERIC NOT NULL,
  fee_usd                   NUMERIC NOT NULL,
  freight_ghs               NUMERIC NOT NULL,
  consolidation_saving_ghs  NUMERIC NOT NULL DEFAULT 0,
  delivery_fee_ghs          NUMERIC NOT NULL DEFAULT 0,
  total_ghs                 NUMERIC NOT NULL,
  total_pesewas             INT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE order_groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON order_groups TO authenticated;
GRANT ALL ON order_groups TO service_role;
CREATE POLICY "order_groups owner read"
  ON order_groups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_order_groups_user ON order_groups (user_id, created_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_group_id       UUID REFERENCES order_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consolidation_box_id UUID REFERENCES consolidation_boxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_address_id  UUID REFERENCES delivery_addresses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_order_group ON orders (order_group_id) WHERE order_group_id IS NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS order_group_id UUID REFERENCES order_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order_group ON payments (order_group_id) WHERE order_group_id IS NOT NULL;

-- ── carts ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id           TEXT,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out', 'abandoned', 'merged')),
  delivery_zone_id     UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
  delivery_address_id  UUID REFERENCES delivery_addresses(id) ON DELETE SET NULL,
  order_group_id       UUID REFERENCES order_groups(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON carts TO authenticated;
GRANT ALL ON carts TO service_role;
CREATE POLICY "carts owner read"
  ON carts FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- One open bag per identity. An adopted cart keeps its session_id, so the
-- anonymous index only covers carts nobody owns yet.
CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_open_user
  ON carts (user_id) WHERE status = 'open' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_open_session
  ON carts (session_id) WHERE status = 'open' AND user_id IS NULL;

CREATE TABLE IF NOT EXISTS cart_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id               UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  extraction_cache_id   UUID NOT NULL REFERENCES extraction_cache(id) ON DELETE RESTRICT,
  quantity              INT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
  special_instructions  TEXT,
  gap_price_usd         NUMERIC CHECK (gap_price_usd IS NULL OR gap_price_usd > 0),
  gap_origin_country    TEXT CHECK (gap_origin_country IS NULL OR gap_origin_country IN ('USA', 'UK', 'CHINA')),
  -- Breakdown at add-to-bag time. Informational; every render re-prices.
  pricing               JSONB,
  quote_lock_id         UUID REFERENCES quote_locks(id) ON DELETE SET NULL,
  consolidation_box_id  UUID REFERENCES consolidation_boxes(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, extraction_cache_id)
);
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON cart_items TO authenticated;
GRANT ALL ON cart_items TO service_role;
CREATE POLICY "cart_items owner read"
  ON cart_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id, created_at);

-- ── extraction_cache cleanup: never drop a row an open bag line points at ─────
-- 044 already protects rows behind an unexpired lock. A bag line is the same
-- kind of promise — its product and price source must outlive the cache TTL.
SELECT cron.unschedule('cleanup-extraction-cache')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-extraction-cache');

SELECT cron.schedule(
  'cleanup-extraction-cache',
  '*/10 * * * *',
  $$
    update extraction_cache
    set is_valid = false
    where is_valid = true and expires_at < now();

    delete from extraction_cache ec
    where ec.expires_at < now() - interval '7 days'
      and not exists (select 1 from orders o where o.extraction_cache_id = ec.id)
      and not exists (
        select 1 from quote_locks ql
        where ql.extraction_cache_id = ec.id and ql.expires_at > now()
      )
      and not exists (
        select 1 from cart_items ci join carts c on c.id = ci.cart_id
        where ci.extraction_cache_id = ec.id and c.status = 'open'
      );
  $$
);

-- ── carts cleanup: an open anonymous bag untouched for 60 days is abandoned ───
SELECT cron.unschedule('cleanup-carts')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-carts');

SELECT cron.schedule(
  'cleanup-carts',
  '45 3 * * *',
  $$
    update carts set status = 'abandoned', updated_at = now()
    where status = 'open' and user_id is null and updated_at < now() - interval '60 days';
  $$
);

-- ── site_settings: payment channels become objects; the hold note gets a row ──
-- 037 seeded `payment_channels` as plain labels for the footer. The bag's
-- "Pay with" selector needs more than a label: `paystack_channel` is what we
-- pass to Paystack's `channels[]` (mobile_money vs card), `provider` is the MoMo
-- network for metadata, `dot` is the brand swatch. Labels stay inside each
-- object so the footer keeps rendering the same words (readStringArray accepts
-- both shapes). "Visa"/"Mastercard" collapse into one `card` channel because
-- that is the one Paystack channel they both ride.
UPDATE site_settings
SET value = '[{"id":"mtn_momo","label":"MTN MoMo","paystack_channel":"mobile_money","provider":"mtn","dot":"#FFCC00"},{"id":"telecel_cash","label":"Telecel Cash","paystack_channel":"mobile_money","provider":"vod","dot":"#E60000"},{"id":"at_money","label":"AT Money","paystack_channel":"mobile_money","provider":"atl","dot":"#0033A0"},{"id":"card","label":"Card","paystack_channel":"card","provider":null,"dot":null}]'::jsonb,
    description = 'Channels offered at checkout and listed in the footer. Each entry: id, label, paystack_channel (mobile_money | card — sent to Paystack), provider (mtn | vod | atl | null), dot (brand colour or null).',
    updated_at = now()
WHERE key = 'payment_channels';

-- The one line under the pay button. Public so the signed-out bag can read it
-- through the anon client; ON CONFLICT so a re-run never overwrites an admin edit.
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('payment_hold_note', '"Paystack holds it until every item is bought"'::jsonb,
   'Payment hold note', 'Shown under the Pay button in the bag. Explains that the charge is held until purchasing is done.', true)
ON CONFLICT (key) DO NOTHING;

-- ── site_settings: the real Tomame WhatsApp number ──────────────────────────
-- 037 seeded a placeholder (+233 24 555 0192) that reached the marketing footer,
-- the contact page and Home's "Ask a buyer" card. 037 is already applied on both
-- hosted projects, so editing its seed only helps a fresh `db reset`; this UPDATE
-- carries the correction to databases that already have the row. Guarded on the
-- placeholder so an admin edit made in the meantime survives.
UPDATE site_settings
SET value = '"+233 59 442 4746"'::jsonb, updated_at = now()
WHERE key = 'whatsapp_number' AND value = '"+233 24 555 0192"'::jsonb;
