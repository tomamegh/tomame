-- Migration 039: admin-editable image overrides.
--
-- `src/config/marketing-images.ts` is the built-in default for every photo, but
-- a TypeScript file can only be changed by a deploy. This table lets an admin
-- re-crop, re-point or re-describe any image on a running environment — which
-- is the difference between "I can fix it locally" and "I can fix it in dev".
--
-- Rows are sparse: only the fields an admin actually overrode are set, and NULL
-- means "use the manifest value". Deleting a row restores the default.
--
-- `position` is a CSS object-position ("50% 18%", "top", "center"). These are
-- tall portrait photos shown in short boxes, so the centre crop cuts off faces;
-- this is the knob that fixes that.

CREATE TABLE IF NOT EXISTS media_overrides (
  key        TEXT PRIMARY KEY,
  src        TEXT,
  alt        TEXT,
  position   TEXT,
  width      INT,
  height     INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT media_overrides_dimensions_paired
    CHECK ((width IS NULL) = (height IS NULL)),
  -- Only ever point at a file we ship. Without this an admin account — or a
  -- stolen admin session — could repoint any marketing image at an external
  -- URL, which is both an exfiltration beacon (referer + IP of every visitor)
  -- and a defacement vector. Replacing a photo means deploying the file.
  CONSTRAINT media_overrides_src_is_local
    CHECK (src IS NULL OR src ~ '^/images/[A-Za-z0-9._/-]+$')
);

ALTER TABLE media_overrides ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON media_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON media_overrides TO authenticated;
GRANT ALL ON media_overrides TO service_role;

CREATE POLICY "media_overrides read all"
  ON media_overrides FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "media_overrides admin write"
  ON media_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Crops the built-in centre default gets wrong. Each of these is a tall portrait
-- rendered in a short landscape box, where "center" lands on a torso.
INSERT INTO media_overrides (key, position) VALUES
  ('mk-buyer-photo',    '50% 12%'),   -- his face is near the top; centre cut his head off
  ('mk-region-us',      '50% 38%'),
  ('mk-region-uk',      '50% 32%'),
  ('mk-region-cn',      '50% 40%'),
  ('mk-delivery-photo', '50% 38%'),
  ('mk-cta-photo',      '50% 45%'),
  ('mk-about-3',        '50% 38%')
ON CONFLICT (key) DO NOTHING;
