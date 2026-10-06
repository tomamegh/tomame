-- Staff alerts for customer messages (091).
--
-- A customer replying to a parcel photo, writing through the contact form or
-- sending a car enquiry put a row in an admin queue and emailed nobody, so a
-- "that's the wrong size" could sit until somebody opened the queue, possibly
-- after the parcel had flown. They now go to the staff alert list under one
-- toggle. A missing toggle reads as on, so the stored events need no change.

ALTER TABLE staff_alert_sends DROP CONSTRAINT IF EXISTS staff_alert_sends_event_type_check;
ALTER TABLE staff_alert_sends ADD CONSTRAINT staff_alert_sends_event_type_check CHECK (event_type IN (
  'order_placed', 'payment_succeeded', 'payment_failed',
  'order_status_changed', 'order_review', 'car_order', 'sourcing_requested',
  'customer_message', 'test'));
