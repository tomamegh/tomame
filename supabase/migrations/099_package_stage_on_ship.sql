-- Migration 099: a package that ships without naming its stage is dispatched.
--
-- 098 requires a shipped package to carry a stage, and the 098 code sets
-- `stage = 'departed'` in the same update that ships it. Code deployed before
-- 098 does not, so between the migration and the deploy every "Mark shipped"
-- failed the CHECK. This fills the stage in the database instead, so the order
-- of migration and deploy no longer matters and a ship from any other writer
-- (the SQL editor, a future job) keeps the invariant too.

BEGIN;

CREATE OR REPLACE FUNCTION public.warehouse_packages_stage_on_ship()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'shipped' AND NEW.stage IS NULL THEN
    NEW.stage    := 'departed';
    NEW.stage_at := COALESCE(NEW.shipped_at, now());
    NEW.stage_by := NEW.shipped_by;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.warehouse_packages_stage_on_ship() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_warehouse_packages_stage_on_ship ON warehouse_packages;
CREATE TRIGGER trg_warehouse_packages_stage_on_ship
  BEFORE INSERT OR UPDATE ON warehouse_packages
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_packages_stage_on_ship();

COMMIT;
