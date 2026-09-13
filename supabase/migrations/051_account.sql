-- Migration 051: the account screen — a phone number, and how the customer
-- wants to be reached.
--
-- WHY THESE THREE COLUMNS. Phase 6's Account screen has six tabs and five of
-- them already have a source: Profile reads `profiles`, Addresses reads
-- `delivery_addresses` (048), Payment reads `payments` (005), Price watch reads
-- `price_watches` (041), Security calls Supabase Auth. Only the Notifications
-- tab had nothing behind it: `notifications.channel` (019) records the channel a
-- message WAS sent on, which is a historical fact, not a preference. Without
-- somewhere to store the preference the toggles would be decoration, so they
-- land on `profiles` — one row per customer already exists there, and the app
-- reads it on every authenticated render (`getAuthenticatedUser`).
--
-- WHY NOT A `notification_preferences` TABLE. Three scalar columns on a row we
-- already read is one fewer join on the hottest read path in the app. A table of
-- its own earns its keep when preferences become per-event ("email me about
-- price drops but not about delivery"); it does not today, and a table with
-- exactly one row per user and three columns is a `profiles` row spelled
-- expensively.
--
-- WHY `phone` IS NULLABLE AND UNVERIFIED. Every account predating this migration
-- has no phone number, and there is no OTP flow to verify one. NOT NULL would
-- need a fake backfill, and a `phone_verified` column would be a claim nothing
-- checks. The number is what the customer typed, and it is treated as such:
-- `delivery_addresses.phone` — the number a courier actually calls — stays the
-- authority for a delivery.
--
-- WHY `whatsapp_opt_in` DEFAULTS FALSE AND `notify_email` DEFAULTS TRUE. Email
-- is the default notification channel (CLAUDE.md) and is the address the account
-- was created with, so it is already consented to. WhatsApp is a different
-- channel to a number we may not hold; defaulting it on would opt every existing
-- customer into messages they never asked for.

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone           TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notify_email    BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN profiles.phone IS
  'Contact number the customer gave for their account, as typed. Unverified — delivery_addresses.phone is what a courier is given.';
COMMENT ON COLUMN profiles.whatsapp_opt_in IS
  'Customer asked for order updates on WhatsApp. Requires profiles.phone; false for every account that predates 051.';
COMMENT ON COLUMN profiles.notify_email IS
  'Customer wants transactional email. True by default — email is the account address and the platform default channel.';

-- ── Privileges ────────────────────────────────────────────────────────────────
--
-- Explicit, per phase-2 §5.2: a local `supabase start` does not reproduce
-- hosted's default privileges, so a migration that says nothing about GRANTs
-- behaves differently in the two places.
--
-- COLUMN-LEVEL, not table-level, and deliberately so. `PATCH /api/app/me` writes
-- `profiles` with the CALLER'S client, not the service role, so the write is
-- RLS-bound — and the policy that admits it, "Users can update own profile"
-- (001), is `auth.uid() = id` with no column restriction. RLS cannot restrict an
-- UPDATE to a subset of columns (the same limitation 041 documents for
-- `notifications.read_at`), so under a table-wide UPDATE grant that policy also
-- permits `update profiles set role = 'admin' where id = auth.uid()` — issued
-- straight at PostgREST with the publishable key that ships in the browser.
-- CLAUDE.md's "never trust the client — no client-provided role" has to be
-- enforced by a privilege, because no policy here can express it.
--
-- So: revoke the blanket UPDATE and grant back exactly the six columns the
-- account screen owns. `role`, `id` and the timestamps become unwritable by any
-- customer regardless of policy. Role changes already run through the service
-- role (`updateUserRole` in users.service.ts is called with `createAdminClient`),
-- which keeps ALL, so the admin path is untouched.
REVOKE UPDATE ON profiles FROM authenticated, anon;
GRANT UPDATE (first_name, last_name, bio, phone, whatsapp_opt_in, notify_email)
  ON profiles TO authenticated;

-- SELECT is unchanged and still row-filtered by the 001 policies; service_role
-- keeps everything. Restated rather than assumed, for the local/hosted parity
-- reason above.
GRANT SELECT ON profiles TO authenticated;
GRANT ALL    ON profiles TO service_role;

COMMIT;
