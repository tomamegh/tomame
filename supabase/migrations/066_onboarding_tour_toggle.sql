-- Migration 066: the first-run tour gets an off switch an admin owns.
--
-- WHY. The tour (064) shipped on for everybody, and whether a product should
-- interrupt a new customer at all is a judgement that belongs to whoever runs
-- the shop, not to a deploy. Kelvin, on seeing it live: "put tour behind a
-- toggle on the admin side. Where once off, new users will not experience it."
--
-- It lives in `site_settings` because that is where every other admin-owned
-- value already lives, which means it is edited on the screen the admin already
-- knows (`/admin/content`, Settings), audited like every other setting change,
-- and changed without a deploy.
--
-- PUBLIC, because the app shell reads it through the cookieless anon client
-- alongside the rest of the storefront's settings, and the anon SELECT policy
-- is `USING (is_public)`. Nothing here is sensitive: it says whether a tour is
-- offered, not anything about a customer.
--
-- SEEDED TRUE so behaviour does not change the moment this applies. Kelvin
-- turns it off where he wants it off. Note the app treats a MISSING or
-- unreadable row as off, not on: a database that never got this migration, or a
-- read that fails, should leave a customer alone rather than hijack their first
-- screen. On is the state that has to be stated.
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('onboarding_tour_enabled', 'true'::jsonb,
   'First-run tour',
   'Whether a customer signing in for the first time is walked through the four-stop tour. Turn it off and nobody new sees it again; anyone part-way through keeps the tour they are already in until they finish or dismiss it.',
   true)
ON CONFLICT (key) DO NOTHING;
