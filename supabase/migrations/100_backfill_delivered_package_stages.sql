-- Migration 100: packages whose orders were all delivered before 098 are delivered.
--
-- 098 backfilled every shipped package as `departed`. On prod most of those
-- cartons were delivered weeks ago, and the shipments board (098) would have
-- listed them as just dispatched. A shipped package with no order still on its
-- way (every line delivered or completed, or no order lines at all) is moved to
-- `delivered`, dated from its last delivery, so it stays off the board's
-- seven-day "Delivered" list too. No order_events are written: the orders
-- already carry their delivered events.

BEGIN;

UPDATE warehouse_packages p
   SET stage    = 'delivered',
       stage_at = COALESCE(d.last_delivered_at, p.shipped_at)
  FROM (
    SELECT pk.id, max(o.delivered_at) AS last_delivered_at
      FROM warehouse_packages pk
      LEFT JOIN warehouse_package_items i ON i.package_id = pk.id
      LEFT JOIN orders o ON o.id = i.order_id
     WHERE pk.status = 'shipped' AND pk.stage = 'departed'
     GROUP BY pk.id
    HAVING bool_and(o.id IS NULL OR o.status IN ('delivered', 'completed'))
  ) d
 WHERE p.id = d.id;

COMMIT;
