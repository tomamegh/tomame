-- Migration 036: marketing content, site settings, regions, delivery zones, waitlist.
--
-- Backs the Phase 1 marketing redesign. Every figure the marketing site shows must
-- come from the database or the live pricing engine — no hardcoded arrays in JSX.
-- Structural copy (titles, descriptions, ordering) lives in site_content; the NUMBERS
-- are resolved at render time from pricing_constants / pricing_groups / exchange_rates
-- via each row's data->>'value_source'. That keeps the marketing site honest when an
-- admin changes a fee.
--
-- ACCESS MODEL. These four content tables are public, read-only, and read by
-- signed-out visitors, so they get an explicit GRANT SELECT to anon+authenticated
-- with RLS narrowing to published/active/public rows. Writes are admin-only.
-- The GRANTs are explicit on purpose: hosted Supabase configures ALTER DEFAULT
-- PRIVILEGES on `public` so new tables are reachable, but a local `supabase start`
-- stack does not (verified — `anon` has SELECT in realtime/storage but none in
-- public, and \ddp is empty). Relying on that default makes local behaviour differ
-- from hosted. Declaring it here makes the two identical.
--
-- waitlist_signups deliberately gets NO grants: service-role only, like
-- extraction_cache and policies.

-- ── site_content — marketing CMS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_content (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  locale       TEXT NOT NULL DEFAULT 'en',
  title        TEXT,
  body         TEXT,
  data         JSONB NOT NULL DEFAULT '{}',
  sort_order   INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES auth.users(id),
  CONSTRAINT site_content_kind_check CHECK (kind IN (
    'faq', 'testimonial', 'process_step', 'value_prop', 'feature_card',
    'fee_line', 'compare_row', 'stat', 'trust_chip', 'hero_copy', 'store'
  )),
  UNIQUE (kind, slug, locale)
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON site_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON site_content TO authenticated;
GRANT ALL ON site_content TO service_role;

CREATE POLICY "site_content read published"
  ON site_content FOR SELECT TO anon, authenticated USING (is_published);

CREATE POLICY "site_content admin write"
  ON site_content FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_site_content_kind ON site_content (kind, sort_order);

-- ── site_settings — singleton key/value settings ──────────────────────────────
-- is_public gates anon reads. Any key holding something not meant for the public
-- page must be inserted with is_public = false; the RLS policy below is the guard.
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  label       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_public   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON site_settings TO authenticated;
GRANT ALL ON site_settings TO service_role;

CREATE POLICY "site_settings read public"
  ON site_settings FOR SELECT TO anon, authenticated USING (is_public);

CREATE POLICY "site_settings admin write"
  ON site_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── regions — purchasing lanes ────────────────────────────────────────────────
-- Only status='live' is purchasable. order-intake must enforce this; today it
-- accepts any of the three ORIGIN_COUNTRIES.
CREATE TABLE IF NOT EXISTS regions (
  code              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'soon' CHECK (status IN ('live', 'soon', 'off')),
  hub_city          TEXT,
  transit_days_min  INT,
  transit_days_max  INT,
  store_names       TEXT[] NOT NULL DEFAULT '{}',
  tag_names         TEXT[] NOT NULL DEFAULT '{}',
  blurb             TEXT,
  photo_key         TEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES auth.users(id)
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON regions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON regions TO authenticated;
GRANT ALL ON regions TO service_role;

CREATE POLICY "regions read all"
  ON regions FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "regions admin write"
  ON regions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── delivery_zones — Ghana-side delivery ──────────────────────────────────────
-- Phase 1 renders these on "Where we buy". Phase 4 charges them: adds
-- delivery_fee_ghs to PricingBreakdown and delivery_zone_id to the order.
-- UNIQUE (name) so the seed in 037 is genuinely idempotent — without it
-- ON CONFLICT DO NOTHING has no arbiter and re-applying duplicates every zone,
-- which would corrupt the "delivery from" figure derived from min/max fees.
CREATE TABLE IF NOT EXISTS delivery_zones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL DEFAULT 'door' CHECK (kind IN ('door', 'pickup')),
  fee_ghs    NUMERIC NOT NULL DEFAULT 0,
  extra_days INT NOT NULL DEFAULT 0,
  note       TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON delivery_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON delivery_zones TO authenticated;
GRANT ALL ON delivery_zones TO service_role;

CREATE POLICY "delivery_zones read active"
  ON delivery_zones FOR SELECT TO anon, authenticated USING (is_active);

CREATE POLICY "delivery_zones admin write"
  ON delivery_zones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── waitlist_signups — UK / China interest ────────────────────────────────────
-- No GRANTs: service-role only. Inserts go through a rate-limited server route,
-- admins read via the admin client. user_id is SET NULL on profile deletion so a
-- removed account never blocks the signup record.
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  phone       TEXT,
  region_code TEXT NOT NULL REFERENCES regions(code),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  UNIQUE (email, region_code)
);

ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;
-- No policies and no anon/authenticated grants: service role only.
GRANT ALL ON waitlist_signups TO service_role;

CREATE INDEX IF NOT EXISTS idx_waitlist_region ON waitlist_signups (region_code, created_at DESC);
