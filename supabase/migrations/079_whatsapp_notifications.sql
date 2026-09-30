-- Migration 079: WhatsApp as a real second channel.
--
-- `notifications.channel` has allowed 'whatsapp' since 019 and
-- `profiles.whatsapp_opt_in` has existed since 051, but nothing ever wrote a
-- whatsapp row because nothing could send one. This migration gives those rows
-- what a queued, retried, provider-tracked message needs.
--
-- TWO STATUSES, ON PURPOSE.
--   `status` is the notifications state machine from CLAUDE.md, unchanged:
--     pending → sent | failed (after 3 attempts). "sent" means Meta's Cloud API
--     accepted the message and gave us an id — the same meaning it has for
--     email ("Resend accepted it"). It never moves again after that.
--   `delivery_status` is what Meta later reports through the webhook:
--     accepted → sent → delivered → read, or failed. It only moves forward.
--     A message Meta accepted and then could not deliver is status 'sent',
--     delivery_status 'failed', with the reason in error_code/error_reason —
--     the transport did its job; the handset did not. The admin log shows both.
--
-- RETRIES. `attempts` counts calls to Meta (max 3, CHECKed). `next_attempt_at`
-- is both the backoff clock and the claim lease: the dispatcher bumps it before
-- calling Meta, so an overlapping run never sends the same row twice.
--
-- DEDUPE. `dedupe_key` is a plain UNIQUE (NULLs distinct), set by callers whose
-- event can fire twice for one fact — Paystack's webhook and the browser verify
-- both reach "paid", for instance. A second insert hits 23505 and is dropped.
--
-- RLS is unchanged: 019's two SELECT policies still cover every column, and
-- clients still have no INSERT/UPDATE/DELETE — every write is the service role.
-- The customer's bell reads only channel = 'email' rows (one bell entry per
-- event); the whatsapp row is a delivery record, not a second bell entry.

BEGIN;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS attempts            SMALLINT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status     TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seen_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code          TEXT,
  ADD COLUMN IF NOT EXISTS error_reason        TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key          TEXT;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_attempts_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_attempts_check
  CHECK (attempts BETWEEN 0 AND 3);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_delivery_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('accepted', 'sent', 'delivered', 'read', 'failed'));

-- Provider tracking is a WhatsApp concept; an email row carrying one is a bug.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_provider_fields_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_provider_fields_check
  CHECK (channel = 'whatsapp' OR (provider_message_id IS NULL AND delivery_status IS NULL));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_dedupe_key_key;
ALTER TABLE notifications ADD CONSTRAINT notifications_dedupe_key_key UNIQUE (dedupe_key);

-- The webhook looks rows up by Meta's wamid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_provider_message_id
  ON notifications (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- The dispatcher's queue: pending whatsapp rows, oldest due first.
CREATE INDEX IF NOT EXISTS idx_notifications_whatsapp_due
  ON notifications (next_attempt_at NULLS FIRST, created_at)
  WHERE channel = 'whatsapp' AND status = 'pending';

COMMENT ON COLUMN notifications.attempts IS 'Calls made to the provider (WhatsApp). 3 retryable failures → status failed.';
COMMENT ON COLUMN notifications.next_attempt_at IS 'Backoff clock and claim lease for the WhatsApp dispatcher. NULL = due now.';
COMMENT ON COLUMN notifications.provider_message_id IS 'Meta Cloud API message id (wamid) once accepted.';
COMMENT ON COLUMN notifications.delivery_status IS 'Carrier outcome from the WhatsApp webhook: accepted → sent → delivered → read, or failed. Forward-only.';
COMMENT ON COLUMN notifications.delivered_at IS 'WhatsApp: when the handset received it.';
COMMENT ON COLUMN notifications.seen_at IS 'WhatsApp: when the customer opened it (read receipts). Not the bell''s read_at.';
COMMENT ON COLUMN notifications.error_code IS 'Last provider error code (Meta), or a local reason such as opted_out / no_phone.';
COMMENT ON COLUMN notifications.dedupe_key IS 'One message per fact: a second insert with the same key is dropped (23505).';

-- ── The dispatcher cron ──────────────────────────────────────────────────────
-- pg_cron → pg_net → /api/cron/whatsapp-dispatch, exactly the shape of
-- run_catalog_scrape() (045): vault first, GUC second, warn when app_url is
-- unset. The route answers quickly with { skipped: 'not_configured' } while the
-- WhatsApp env vars are absent, so scheduling it before Meta is set up is safe.

create or replace function run_whatsapp_dispatch() returns void as $$
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

  v_app_url := coalesce(v_app_url, current_setting('app.settings.app_url', true));
  v_cron_secret := coalesce(v_cron_secret, current_setting('app.settings.cron_secret', true));

  if v_app_url is null or v_app_url = '' then
    raise warning 'app_url not configured: set vault secret "app_url" (or app.settings.app_url)';
    return;
  end if;

  perform net.http_get(
    url := v_app_url || '/api/cron/whatsapp-dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
    ),
    timeout_milliseconds := 60000
  );
end;
$$ language plpgsql security definer;

select cron.unschedule('whatsapp-dispatch')
  where exists (select 1 from cron.job where jobname = 'whatsapp-dispatch');

-- Every minute: a status update that lands ten minutes late is not an update.
-- One small batch per run (20 rows), so a run is a few seconds.
select cron.schedule(
  'whatsapp-dispatch',
  '* * * * *',
  $$ select run_whatsapp_dispatch(); $$
);

COMMIT;
