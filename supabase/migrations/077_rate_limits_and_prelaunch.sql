-- 077 — pre-launch hardening.
--
-- 1. rate_limits + hit_rate_limit(): the limiter used to be an in-memory Map
--    per Vercel instance, so every cold start and every parallel instance had
--    its own budget. It is a fixed-window counter in Postgres now. Service
--    role only: RLS on, no policies, EXECUTE granted to service_role alone.
-- 2. revoke_user_sessions(): deactivating a user or changing their role ends
--    every session they hold. supabase-js has no "sign out user by id" (its
--    admin signOut takes the user's own JWT), so the sessions are deleted here;
--    auth.refresh_tokens cascades from auth.sessions, and GoTrue's /user
--    (which getAuthenticatedUser calls) rejects a token whose session is gone.
-- 3. site_settings for copy that was hardcoded on /contact and /fees.

-- ── 1. Rate limits ──────────────────────────────────────────────────────────

create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (key, window_start)
);

create index if not exists idx_rate_limits_window_start on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.hit_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be positive';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = rl.count + 1
  returning rl.count into v_count;

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at := v_window_start + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- Plain SQL delete: nothing here calls the app, so no vault/GUC lookup.
select cron.unschedule('cleanup-rate-limits')
  where exists (select 1 from cron.job where jobname = 'cleanup-rate-limits');

select cron.schedule(
  'cleanup-rate-limits',
  '17 * * * *',
  $$ delete from public.rate_limits where window_start < now() - interval '1 day'; $$
);

-- ── 2. Session revocation ───────────────────────────────────────────────────

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_deleted integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  -- Tokens minted before sessions existed carry no session_id.
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  return v_deleted;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- ── 3. Contact and fees copy ────────────────────────────────────────────────

insert into public.site_settings (key, value, label, description, is_public) values
  ('support_email', '"support@tomame.ca"'::jsonb,
   'Support email',
   'The address customers write to. Shown on the contact page.',
   true),
  ('support_reply_time', '"usually under 2 hours"'::jsonb,
   'Email reply time',
   'How fast an email is answered, as it reads mid-sentence (“Fastest response, usually under 2 hours”). Shown on the contact page.',
   true),
  ('refund_promise_title', '"Can''t source it? 100% back."'::jsonb,
   'Refund promise (headline)',
   'The refund headline on the Fees page. Keep it in line with the refund policy.',
   true),
  ('refund_promise_detail', '"Including our fee, within 24 hours."'::jsonb,
   'Refund promise (detail)',
   'The line under the refund headline on the Fees page. Keep it in line with the refund policy.',
   true)
on conflict (key) do nothing;
