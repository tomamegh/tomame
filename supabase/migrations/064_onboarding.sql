-- Migration 064: the first-time tour, and never showing it twice.
--
-- Kelvin's brief: a first-time greeting and a small four-stop tour, the first
-- time a signed-in customer lands in `/app`. It must survive a reload and a
-- new device, so the "have they seen it" flag cannot live in localStorage
-- alone — it needs a row.
--
-- TWO TIMESTAMPS, NOT ONE BOOLEAN. "Completed" (walked all four stops) and
-- "dismissed" (closed early) are different facts about the same customer, and
-- an admin reading this table later may care which one happened — a customer
-- who dismissed on stop one is a different signal than one who finished.
-- Both are terminal: `shouldShowOnboardingTour` (the pure predicate in
-- `src/features/onboarding/tour-predicate.ts`) refuses to start the tour again
-- once EITHER is set, so a completed customer is never re-shown "did you mean
-- to skip this" and a dismissed customer is never nagged again either.
--
-- NULLABLE, both. Every account created before this migration has neither —
-- backfilling either to "now" would claim a tour was seen that never ran, and
-- backfilling to "never" is exactly what NULL already means.

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.onboarding_completed_at IS
  'Set once the customer walks all four stops of the first-run tour. Null for every account that predates 064 or has not finished it. Terminal: never cleared.';
COMMENT ON COLUMN profiles.onboarding_dismissed_at IS
  'Set the moment the customer closes the first-run tour early (Escape, or the close control). Terminal, like onboarding_completed_at — either one alone stops the tour from ever starting again.';

-- ── Privileges ────────────────────────────────────────────────────────────────
--
-- Same shape 051 used for the account screen: `PATCH /api/app/onboarding`
-- writes `profiles` with the CALLER'S client, not the service role, so the
-- write is RLS-bound. The 001 policy "Users can update own profile"
-- (`auth.uid() = id`) already scopes the row; column-level grants are what
-- decide WHICH columns that policy is allowed to touch, because RLS itself
-- cannot restrict an UPDATE to a subset of columns (051 explains this at
-- length, and 041 hits the same wall for `notifications.read_at`).
--
-- A GRANT UPDATE naming a column ADDS it to whatever the role can already
-- write — it does not replace 051's list. `first_name`, `last_name`, `bio`,
-- `phone`, `whatsapp_opt_in` and `notify_email` stay exactly as writable as
-- they were; this only adds the two columns above. `role`, `id` and the
-- timestamps 001 owns remain unwritable by any customer, same as before.
GRANT UPDATE (onboarding_completed_at, onboarding_dismissed_at)
  ON profiles TO authenticated;

COMMIT;
