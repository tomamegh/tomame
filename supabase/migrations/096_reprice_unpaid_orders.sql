-- Migration 096: unpaid orders follow an admin pricing change.
--
-- WHY. An order's total is struck at checkout and Paystack charges that
-- column, so a freight fix left every unpaid order on the old figure until it
-- was paid or expired. An admin pricing save now re-prices them in the
-- background (src/features/orders/services/order-reprice.service.ts); this job
-- repeats it every 15 minutes for a lost run and for orders whose payment was
-- open at the time. With nothing changed it writes nothing.
--
-- Same pattern as 083: run_ops_job() reads the vault first and the GUC second.

CREATE OR REPLACE FUNCTION run_reprice_unpaid_orders() RETURNS void AS $$
  SELECT run_ops_job('/api/cron/reprice-unpaid-orders');
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Postgres grants EXECUTE to PUBLIC by default (094).
REVOKE ALL ON FUNCTION run_reprice_unpaid_orders() FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.unschedule('reprice-unpaid-orders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reprice-unpaid-orders');
-- :08 past each quarter, clear of reconcile-payments (:00/:05) and ops-alerts (:02/:07).
SELECT cron.schedule('reprice-unpaid-orders', '8,23,38,53 * * * *', $$ SELECT run_reprice_unpaid_orders(); $$);
