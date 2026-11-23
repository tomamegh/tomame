-- Migration 122: email-code sign-in (Seamless Roadmap, Initiative 1).
--
-- The emailed code signs in an existing account or confirms a new one. Before
-- checking a code the server needs to know which: an address someone
-- registered with a password and never confirmed must lose that password once
-- its real owner proves the inbox (account pre-hijacking). `profiles` carries
-- no email, and PostgREST cannot read `auth`, so this is the one narrow window
-- onto it: account id + confirmed flag for one address. Service role only.

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_email_state(p_email text)
RETURNS TABLE (user_id uuid, confirmed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.email_confirmed_at IS NOT NULL
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
    AND u.deleted_at IS NULL
    AND NOT u.is_anonymous
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_email_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email_state(text) TO service_role;

COMMENT ON FUNCTION public.auth_email_state(text) IS
  '122. Account id + confirmed flag for one address; service role only. Read by src/db/queries/auth-email-state.ts for email-code sign-in.';

COMMIT;
