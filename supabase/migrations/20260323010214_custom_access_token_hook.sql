create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
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


grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

