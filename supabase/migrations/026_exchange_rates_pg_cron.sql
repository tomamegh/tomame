-- Exchange rate refresh via pg_cron + pg_net.
-- Calls our /api/cron/exchange-rates endpoint 6 times daily.
--
-- Setup required (run once in Supabase SQL editor for production):
--   alter database postgres set app.settings.app_url = 'https://your-app.vercel.app';
--   alter database postgres set app.settings.cron_secret = 'your-cron-secret';

create extension if not exists pg_net with schema extensions;

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

-- Every 4 hours: 0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC
select cron.schedule(
  'fetch-exchange-rates',
  '0 0,4,8,12,16,20 * * *',
  $$ select refresh_exchange_rates(); $$
);
