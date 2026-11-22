-- 112: a sealed package can always be shipped, held with a reason, unsealed, or
-- resolved (site brief, Fix 10).
--
-- Four packages on prod sat sealed for 3-5 weeks: their orders had been marked
-- delivered from the admin while the parcels were on the bench, so every ship
-- attempt failed with "Cannot transition order from 'completed' to
-- 'in_transit'" and there was nothing else to do with them.
--
-- * Hold: a sealed package can be held with a reason (it stays sealed, cannot
--   ship until released, and shows as held rather than stuck).
-- * Void: a package whose orders are already delivered is resolved as a record
--   error or duplicate, with a note and a manager (admin) confirming. Its items
--   stay linked, so the order is never packed twice.
-- * Seal override: sealing a package with a delivered, completed or cancelled
--   order needs an explicit reason, recorded on the package.
-- * Empty packages still `packing` after 7 days are deleted daily.

BEGIN;

ALTER TABLE warehouse_packages
  ADD COLUMN IF NOT EXISTS hold_reason TEXT CHECK (hold_reason IS NULL OR length(btrim(hold_reason)) > 0),
  ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS held_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seal_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT CHECK (void_reason IN ('record_error', 'duplicate')),
  ADD COLUMN IF NOT EXISTS void_note TEXT;

ALTER TABLE warehouse_packages DROP CONSTRAINT IF EXISTS warehouse_packages_status_check;
ALTER TABLE warehouse_packages ADD CONSTRAINT warehouse_packages_status_check
  CHECK (status IN ('packing', 'sealed', 'shipped', 'voided'));

-- A voided package carries its resolution; a held one its reason.
ALTER TABLE warehouse_packages DROP CONSTRAINT IF EXISTS warehouse_packages_void_complete;
ALTER TABLE warehouse_packages ADD CONSTRAINT warehouse_packages_void_complete
  CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND length(btrim(coalesce(void_note, ''))) > 0));

COMMENT ON COLUMN warehouse_packages.hold_reason IS '112: why a sealed package is held. Set = cannot ship until released.';
COMMENT ON COLUMN warehouse_packages.seal_override_reason IS '112: why it was sealed although an order in it was already delivered, completed or cancelled.';
COMMENT ON COLUMN warehouse_packages.void_reason IS '112: record_error (its orders were already delivered) or duplicate. Confirmed by a manager (voided_by is an admin).';

CREATE INDEX IF NOT EXISTS idx_warehouse_packages_sealed_age
  ON warehouse_packages (sealed_at) WHERE status = 'sealed';

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-empty-packages') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-empty-packages');
  PERFORM cron.schedule(
    'cleanup-empty-packages',
    '35 3 * * *',
    $job$
      DELETE FROM warehouse_packages p
      WHERE p.status = 'packing'
        AND p.created_at < now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM warehouse_package_items i WHERE i.package_id = p.id);
    $job$
  );
END $$;

COMMIT;
