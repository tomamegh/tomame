-- Migration 089: admin-managed banners on chosen sections of the app.
--
-- Kelvin's brief: a small banner in checkout (and elsewhere when needed) that an
-- admin can write, switch on and off, and schedule without a deploy. The first
-- use is "we do not take international payments yet", so a customer knows
-- before they reach Paystack.
--
-- `placement` is a closed list: each value is a slot the code renders. A new
-- slot needs code anyway, so it also gets a migration extending the CHECK.
-- Optional `starts_at` / `ends_at` schedule a banner; the read policy applies
-- them, so an expired banner disappears without anyone touching it.
--
-- Reads: anyone (the bag is public) sees live rows only. Writes: service role
-- only, through `/api/admin/banners`, which checks the admin and audits.

BEGIN;

CREATE TABLE IF NOT EXISTS site_banners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement   TEXT NOT NULL CHECK (placement IN ('checkout', 'app_home', 'buy', 'cars')),
  tone        TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'warning', 'success', 'promo')),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body        TEXT CHECK (body IS NULL OR char_length(body) <= 400),
  link_label  TEXT CHECK (link_label IS NULL OR char_length(link_label) <= 40),
  link_url    TEXT CHECK (link_url IS NULL OR char_length(link_url) <= 500),
  is_active   BOOLEAN NOT NULL DEFAULT false,
  dismissible BOOLEAN NOT NULL DEFAULT false,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT site_banners_link_pair CHECK ((link_label IS NULL) = (link_url IS NULL)),
  CONSTRAINT site_banners_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

COMMENT ON TABLE site_banners IS
  'Admin-written banners shown in a named slot of the app (089). Live = is_active and inside the optional starts_at/ends_at window.';

CREATE INDEX IF NOT EXISTS idx_site_banners_live ON site_banners (placement, sort_order) WHERE is_active;

ALTER TABLE site_banners ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON site_banners TO anon, authenticated;
GRANT ALL ON site_banners TO service_role;

DROP POLICY IF EXISTS "site_banners read live" ON site_banners;
CREATE POLICY "site_banners read live"
  ON site_banners FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

-- The first banner, as a DRAFT (is_active = false): the wording is the admin's
-- call, so it waits on /admin/banners to be read and switched on.
INSERT INTO site_banners (placement, tone, title, body, is_active, sort_order)
SELECT 'checkout', 'warning',
       'Payments from Ghana only, for now',
       'We accept Mobile Money and Ghana-issued cards. Cards issued outside Ghana are not supported yet.',
       false, 0
WHERE NOT EXISTS (SELECT 1 FROM site_banners);

COMMIT;
