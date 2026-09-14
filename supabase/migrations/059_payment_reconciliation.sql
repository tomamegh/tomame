-- Migration 059: payment reconciliation — the money that never settles.
--
-- WHY. On production every payment ever created sat `pending` for five days.
-- Paystack only ever fires `charge.success` (there is no "abandoned" webhook),
-- and the browser callback only runs when the customer comes back to the tab.
-- A customer who closes Paystack's page therefore leaves a `pending` row that
-- nothing on this platform will ever touch — and `assertNoActivePayment` then
-- refuses them a second attempt, so their bag is held hostage to a payment they
-- abandoned. Nothing was watching for the ABSENCE of a result.
--
-- WHAT. A pg_cron job calls `/api/cron/reconcile-payments` every five minutes.
-- The route verifies every pending payment older than a few minutes against
-- Paystack, settles what succeeded, records what failed, and releases what was
-- abandoned once it is older than `payment_expiry_minutes`. Then it cancels
-- orders and bags that have had no payment at all for `unpaid_order_ttl_hours`.
-- The rule that makes this safe: NOTHING is released or cancelled on our clock
-- alone — Paystack is asked first, every time.
--
-- Same shape as run_sweep_extractions() (049): read the vault first and the GUC
-- second, and RAISE WARNING when app_url is unset, so an install with no vault
-- secret is loud rather than a job that runs on time and calls nothing.

-- ── the two durations, admin-tunable ──────────────────────────────────────────
-- Public on purpose: "we hold a payment open for 60 minutes" is something the
-- customer may be told, and the anon-read policy is `USING (is_public)`, which
-- is also what lets the job's settings read see them.
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('payment_expiry_minutes', '60'::jsonb,
   'Payment expiry (minutes)',
   'How long a started Paystack payment may stay pending before it is released so the customer can pay again. The job asks Paystack first and only releases what Paystack also reports as not paid.',
   true),
  ('unpaid_order_ttl_hours', '48'::jsonb,
   'Unpaid order lifetime (hours)',
   'How long a pending order or bag with no payment at all is kept before it is closed and the customer told. Quotes lock the exchange rate for 24 hours, so a longer wait means a stale price.',
   true)
ON CONFLICT (key) DO NOTHING;

-- The job lists pending payments oldest-first; keep that a range scan.
CREATE INDEX IF NOT EXISTS idx_payments_pending_created
  ON payments (created_at) WHERE status = 'pending';

-- ── the job ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_reconcile_payments() RETURNS void AS $$
DECLARE
  v_app_url text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret INTO v_app_url
  FROM vault.decrypted_secrets WHERE name = 'app_url';

  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  v_app_url := coalesce(v_app_url, current_setting('app.settings.app_url', true));
  v_cron_secret := coalesce(v_cron_secret, current_setting('app.settings.cron_secret', true));

  IF v_app_url IS NULL OR v_app_url = '' THEN
    RAISE WARNING 'app_url not configured: set vault secret "app_url" (or app.settings.app_url)';
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := v_app_url || '/api/cron/reconcile-payments',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
    ),
    timeout_milliseconds := 120000
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.unschedule('reconcile-payments')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments');

-- :02, :07, :12 ... so it never lands on the same minute as the ten-minute jobs.
SELECT cron.schedule('reconcile-payments', '2-59/5 * * * *', $$ SELECT run_reconcile_payments(); $$);
