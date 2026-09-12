-- Migration 046: extraction_requests — who pasted which link.
--
-- Split out of migration 041 (unreleased) so the extraction pipeline does not
-- depend on the redesign's Phase 2 schema. `extraction.service.ts` records every
-- paste here, and that service ships on the shared trunk alongside the scraper
-- improvements; price_watches and the Home read-state stay in 041 with the rest
-- of Phase 2.
--
-- WHY extraction_requests EXISTS. The Home screen shows a "Live receipt · last
-- link you pasted" card. The obvious source is extraction_cache, but migration 035
-- deliberately re-keyed that table to be PRODUCT-keyed (unique on url_hash alone)
-- so ten customers pasting the same link share one extraction. Its user_id column
-- survives only as "who requested it most recently" and is overwritten by the next
-- customer to paste the same URL. Selecting `where user_id = me order by updated_at`
-- therefore returns a row that may belong to someone else's paste, and silently
-- loses yours the moment another customer pastes the same link. That is wrong in a
-- way nobody would notice. extraction_requests records the (user, link) fact
-- directly instead, and points at the shared extraction for the priced result.
--
-- ACCESS MODEL. Per-customer data: owner-scoped RLS, reachable by the
-- cookie-bound authenticated client. GRANTs are explicit on purpose — hosted
-- Supabase configures ALTER DEFAULT PRIVILEGES on `public` so new tables are
-- reachable, but a local `supabase start` stack does not. See migration 036.

-- ── extraction_requests — who pasted which link ───────────────────────────────
-- One row per (customer, product link), not one per paste: the Home card wants
-- "the last link you pasted", so a repeat paste bumps updated_at rather than
-- growing the table. user_id is NOT NULL because the quote flow is public and an
-- anonymous paste has no one to show a receipt to — the writer skips those.
-- extraction_cache_id is SET NULL on delete so a pruned cache row leaves the
-- paste record intact; the card then falls back to re-reading by url_hash.
CREATE TABLE IF NOT EXISTS extraction_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url_hash            TEXT NOT NULL,
  product_url         TEXT NOT NULL,
  extraction_cache_id UUID REFERENCES extraction_cache(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, url_hash)
);

ALTER TABLE extraction_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON extraction_requests TO authenticated;
GRANT ALL ON extraction_requests TO service_role;

CREATE POLICY "extraction_requests owner read"
  ON extraction_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "extraction_requests owner write"
  ON extraction_requests FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- The Home card's only query: newest paste for one customer.
CREATE INDEX IF NOT EXISTS idx_extraction_requests_user
  ON extraction_requests (user_id, updated_at DESC);

