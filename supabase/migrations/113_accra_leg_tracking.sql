-- 113: the Accra leg is tracked, or says why not (site brief, Fix 12).
--
-- Two kinds of tracking, kept apart:
--   * store tracking: the store's parcel to the US hub (inbound_parcels, 086),
--     whose arrival is what makes a delivery date firm (Fix 6);
--   * the Delta Cargo air waybill for the JFK → Accra leg: on the package that
--     flew (warehouse_packages.tracking_number, carrier 'Delta Cargo') and on
--     the departure it flew on (flight_departures.awb, 111).
-- A package or an order moved to in transit without an air waybill must carry
-- a reason, shown in admin and to the customer.

BEGIN;

ALTER TABLE warehouse_packages
  ADD COLUMN IF NOT EXISTS no_tracking_reason TEXT CHECK (no_tracking_reason IS NULL OR length(btrim(no_tracking_reason)) > 0),
  ADD COLUMN IF NOT EXISTS departure_id UUID REFERENCES flight_departures(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS no_tracking_reason TEXT CHECK (no_tracking_reason IS NULL OR length(btrim(no_tracking_reason)) > 0);

COMMENT ON COLUMN warehouse_packages.no_tracking_reason IS '113: why it shipped without a Delta Cargo air waybill.';
COMMENT ON COLUMN warehouse_packages.departure_id IS '113: the Delta Cargo departure (111) the package flew on, set when it ships.';
COMMENT ON COLUMN orders.no_tracking_reason IS '113: why the order went in transit without an air waybill (admin path).';

CREATE INDEX IF NOT EXISTS idx_warehouse_packages_departure ON warehouse_packages (departure_id) WHERE departure_id IS NOT NULL;

COMMIT;
