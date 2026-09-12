-- Migration 040: uploaded replacements for marketing images.
--
-- Migration 039 let an admin re-crop an image but deliberately refused to let
-- them repoint `src` anywhere except a file we ship, because an arbitrary URL
-- is both an exfiltration beacon (referer + IP of every visitor) and a
-- defacement vector. That constraint stands. This migration adds the *safe*
-- way to replace a photo: upload the bytes to our own storage bucket.
--
-- `storage_path` names an object in the private `marketing-media` bucket. It is
-- never a URL, so a row cannot point at a third party, and it stays valid when
-- the same database is pointed at a different environment. The bytes are served
-- by /api/media/[key], which streams them from storage using the service role —
-- the bucket itself is private and has no public URL.

-- Private bucket. Nothing reads it directly; /api/media/[key] is the only door.
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-media', 'marketing-media', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE media_overrides
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS byte_size    INT;

-- An object key inside the bucket: "marketing/<slot>-<random>.webp".
-- No scheme, no host, no "..", no leading slash.
ALTER TABLE media_overrides
  DROP CONSTRAINT IF EXISTS media_overrides_storage_path_shape;
ALTER TABLE media_overrides
  ADD CONSTRAINT media_overrides_storage_path_shape
    CHECK (storage_path IS NULL OR storage_path ~ '^marketing/[A-Za-z0-9._-]+$');

-- An uploaded image must carry its real dimensions. The builder measures them
-- server-side after re-encoding, so this can never be skipped; the constraint
-- stops a hand-written row from leaving next/image with the manifest's aspect
-- ratio applied to a differently-shaped file.
ALTER TABLE media_overrides
  DROP CONSTRAINT IF EXISTS media_overrides_upload_has_dimensions;
ALTER TABLE media_overrides
  ADD CONSTRAINT media_overrides_upload_has_dimensions
    CHECK (storage_path IS NULL OR (width IS NOT NULL AND height IS NOT NULL));

-- Only ever WebP: the builder re-encodes every upload through sharp, which
-- normalises the format, strips EXIF and guarantees the bytes really are an
-- image rather than a polyglot carrying script.
ALTER TABLE media_overrides
  DROP CONSTRAINT IF EXISTS media_overrides_content_type_allowed;
ALTER TABLE media_overrides
  ADD CONSTRAINT media_overrides_content_type_allowed
    CHECK (content_type IS NULL OR content_type = 'image/webp');
