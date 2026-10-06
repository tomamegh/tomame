-- Staff alerts for sourcing requests (090).
--
-- A customer asking a buyer to find or price an item (a sourcing request on a
-- bag line, or an assisted request from the paste screen) put a row in an
-- admin queue and emailed nobody, so requests sat until someone happened to
-- open the queue. They now go to the staff order alert list like orders do,
-- under their own toggle. A missing toggle reads as on (normaliseEvents), so
-- the stored events object needs no change.

ALTER TABLE staff_alert_sends DROP CONSTRAINT IF EXISTS staff_alert_sends_event_type_check;
ALTER TABLE staff_alert_sends ADD CONSTRAINT staff_alert_sends_event_type_check CHECK (event_type IN (
  'order_placed', 'payment_succeeded', 'payment_failed',
  'order_status_changed', 'order_review', 'car_order', 'sourcing_requested', 'test'));
