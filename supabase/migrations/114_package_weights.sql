-- 114: weights are confirmed and box capacity is enforced (site brief, Fix 11).
--
-- Every box weight at review was an estimate, 21 items counted at 0 lb, and the
-- 9 lb capacity was never enforced (a 141.2 lb TV sat in a 9 lb box at "100% ·
-- 0 lb spare"). The rules live in src/features/warehouse/weights.ts; this
-- migration records the two reasons a package can be sealed against them.
--
-- * weight_estimate_reason: sealed without the package going on the scale.
-- * capacity_override_reason: sealed, or filled, past the box capacity
--   (pricing_constants.box_capacity_lbs) or with an oversize item alongside
--   others.
-- An item with no weight at all has no override: it is weighed first.

BEGIN;

ALTER TABLE warehouse_packages
  ADD COLUMN IF NOT EXISTS weight_estimate_reason TEXT CHECK (weight_estimate_reason IS NULL OR length(btrim(weight_estimate_reason)) > 0),
  ADD COLUMN IF NOT EXISTS capacity_override_reason TEXT CHECK (capacity_override_reason IS NULL OR length(btrim(capacity_override_reason)) > 0);

COMMENT ON COLUMN warehouse_packages.weight_estimate_reason IS '114: why it was sealed on the estimated weight instead of a scale reading.';
COMMENT ON COLUMN warehouse_packages.capacity_override_reason IS '114: why it holds more than the box capacity, or an oversize item with other things.';

COMMIT;
