-- Move the exchange-rate cron's settings into Supabase Vault.
--
-- WHY
--
-- 026 reads app.settings.app_url and app.settings.cron_secret through
-- current_setting(), and expected them to be populated with
--
--   alter database postgres set app.settings.app_url = '...';
--
-- That statement cannot run on a current Supabase project. The `postgres` role
-- owns the database but is NOT a superuser, and PostgreSQL 15+ requires
-- superuser to set an *undefined placeholder* GUC at database or role scope --
-- permissions cannot be checked for a parameter the server has no definition
-- for. Both the Management API and the SQL editor connect as `postgres`, so
-- both answer 42501: permission denied to set parameter "app.settings.app_url".
--
-- The failure mode this produced is the dangerous kind: refresh_exchange_rates()
-- read null, raised a warning, and returned. The job kept firing every four
-- hours and kept doing nothing -- no failed request, no error, nothing to alert
-- on -- while pricing_config.exchange_rate went stale. That rate converts every
-- order to GHS, so the visible symptom is mispricing, not an outage.
--
-- supabase_vault is writable by `postgres`, so the values live there now. The
-- current_setting() fallback is retained: an environment already configured the
-- old way (or a future one where the GUC is grantable) keeps working unchanged.

create or replace function refresh_exchange_rates() returns void as $$
declare
  v_app_url text;
  v_cron_secret text;
begin
  select decrypted_secret into v_app_url
  from vault.decrypted_secrets
  where name = 'app_url';

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'cron_secret';

  -- Fall back to the GUCs 026 used, so this is not a one-way door.
  v_app_url := coalesce(v_app_url, current_setting('app.settings.app_url', true));
  v_cron_secret := coalesce(v_cron_secret, current_setting('app.settings.cron_secret', true));

  if v_app_url is null or v_app_url = '' then
    raise warning 'app_url not configured: set vault secret "app_url" (or app.settings.app_url)';
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
