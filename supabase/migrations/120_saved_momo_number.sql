-- Migration 120: the customer's Mobile Money number, remembered with consent
-- (Seamless Roadmap, Initiative 1: "pre-fill and remember the MoMo number").
--
-- Pay sends the MoMo prompt straight to a phone (Paystack's charge API) instead
-- of the hosted checkout, where the customer typed the number every time. The
-- number is saved ONLY when the customer ticks "Remember this number" on a
-- payment, and cleared when they pay with the box unticked — so the three
-- columns are set together or not at all.
--
-- WRITES ARE SERVER-ONLY. 051 revoked table-wide UPDATE from `authenticated`
-- and granted back six named columns; these three are deliberately not added to
-- that grant, so the only writer is the payment service under the service role,
-- which also writes the audit row. SELECT stays as 001 left it (own row only).

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS momo_phone     TEXT,
  ADD COLUMN IF NOT EXISTS momo_provider  TEXT,
  ADD COLUMN IF NOT EXISTS momo_saved_at  TIMESTAMPTZ;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_momo_phone_format;
ALTER TABLE profiles ADD CONSTRAINT profiles_momo_phone_format
  CHECK (momo_phone IS NULL OR momo_phone ~ '^\+233[1-9][0-9]{8}$');

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_momo_provider_known;
ALTER TABLE profiles ADD CONSTRAINT profiles_momo_provider_known
  CHECK (momo_provider IS NULL OR momo_provider IN ('mtn', 'vod', 'atl'));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_momo_saved_together;
ALTER TABLE profiles ADD CONSTRAINT profiles_momo_saved_together
  CHECK (
    (momo_phone IS NULL AND momo_provider IS NULL AND momo_saved_at IS NULL)
    OR (momo_phone IS NOT NULL AND momo_provider IS NOT NULL AND momo_saved_at IS NOT NULL)
  );

COMMENT ON COLUMN profiles.momo_phone IS
  '120. Mobile Money number (E.164, +233…) the customer asked us to remember at Pay. Server-written only.';
COMMENT ON COLUMN profiles.momo_provider IS
  '120. Paystack MoMo provider for momo_phone: mtn | vod (Telecel) | atl (AirtelTigo).';
COMMENT ON COLUMN profiles.momo_saved_at IS
  '120. When the customer ticked "Remember this number"; the consent record.';

COMMIT;
