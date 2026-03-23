-- Add SECURITY DEFINER so the hook runs with the function owner's privileges,
-- bypassing RLS on the profiles table. Without this, auth.uid() is null during
-- JWT minting, no RLS policy matches, and the role always defaults to 'user'.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
  declare
    claims jsonb;
    user_role text;
  begin
    select role into user_role from public.profiles where id = (event->>'user_id')::uuid;

    claims := event->'claims';

    if jsonb_typeof(claims->'app_metadata') is null then
      claims := jsonb_set(claims, '{app_metadata}', '{}');
    end if;

    claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(coalesce(user_role, 'user')));

    return jsonb_set(event, '{claims}', claims);
  end;
$$;
