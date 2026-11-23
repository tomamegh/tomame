-- 119: the communication center (Kelvin, 2026-11-23): admin writes a message,
-- picks who gets it, and sends it; signed-in customers see it as a pop-up the
-- next time they open the app, and in their bell until they dismiss it.
--
-- Its own tables, not `notifications`: a notifications row is an EMAIL (channel
-- email|whatsapp) that the dispatcher sends, and an announcement must never be
-- mailed by accident. An "all customers" message is one row, not one per
-- customer; a receipt is written when a customer sees or dismisses it.

BEGIN;

CREATE TABLE IF NOT EXISTS announcements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  body           TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  -- Same-origin paths only: a message must not send a customer off the site.
  link_href      TEXT CHECK (link_href IS NULL OR (link_href LIKE '/%' AND link_href NOT LIKE '//%')),
  link_label     TEXT CHECK (link_label IS NULL OR length(btrim(link_label)) BETWEEN 1 AND 40),
  -- all: every signed-in customer; ordered: customers with a paid order; one: a single customer.
  audience       TEXT NOT NULL CHECK (audience IN ('all', 'ordered', 'one')),
  target_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'withdrawn')),
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at   TIMESTAMPTZ,
  -- Shown until this moment; null = until dismissed.
  expires_at     TIMESTAMPTZ,
  CONSTRAINT announcements_target_for_one CHECK ((audience = 'one') = (target_user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_announcements_live ON announcements (created_at DESC) WHERE status = 'sent';

CREATE TABLE IF NOT EXISTS announcement_receipts (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at    TIMESTAMPTZ,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_announcement_receipts_user ON announcement_receipts (user_id);

-- Service role only: the API checks who is asking (customer: their own; admin: all).
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON announcements FROM anon, authenticated;
REVOKE ALL ON announcement_receipts FROM anon, authenticated;
GRANT ALL ON announcements TO service_role;
GRANT ALL ON announcement_receipts TO service_role;

COMMENT ON TABLE announcements IS '119: messages admin sends from the communication center; shown in-app as a pop-up and in the bell, never emailed.';

COMMIT;
