-- Move exchange rate fetching from Vercel cron to pg_cron + pg_net.
-- Runs 6 times daily at 0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC.
--
-- pg_cron triggers pg_net to call our own API endpoint,
-- which uses the FREECURRENCY_API_KEY env var to fetch rates.
--
-- Setup required: store your app URL and service role key in Postgres config:
--   alter database postgres set app.settings.supabase_url = 'https://your-project.supabase.co';
--   alter database postgres set app.settings.service_role_key = 'your-service-role-key';

create extension if not exists pg_net with schema extensions;

-- Call our own /api/cron/exchange-rates endpoint via pg_net.
create or replace function refresh_exchange_rates() returns void as $$
declare
  v_app_url text;
  v_cron_secret text;
begin
  v_app_url := current_setting('app.settings.app_url', true);
  v_cron_secret := current_setting('app.settings.cron_secret', true);

  if v_app_url is null or v_app_url = '' then
    raise warning 'app.settings.app_url not configured';
    return;
  end if;

  perform net.http_get(
    url := v_app_url || '/api/cron/exchange-rates',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
    )
  );
end;
$$ language plpgsql security definer;

-- Schedule: fetch rates 6 times daily (every 4 hours)
select cron.schedule(
  'fetch-exchange-rates',
  '0 0,4,8,12,16,20 * * *',
  $$ select refresh_exchange_rates(); $$
);
