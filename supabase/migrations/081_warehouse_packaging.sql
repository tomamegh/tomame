-- Migration 081: the warehouse — a role, packages, and the label on the box.
--
-- Kelvin's brief (2026-09-30): parcel feedback stops being a screen of its own
-- and folds into a packaging platform for the people at the US hub. An admin or
-- a new WAREHOUSE OPERATOR puts several items in one package, prints a branded
-- label with a QR code, sticks it on, and anyone on staff who scans that code
-- sees what is inside.
--
-- THE ROLE. `profiles.role` gains 'warehouse'. `custom_access_token_hook` copies
-- the column into the JWT verbatim, so no hook change is needed. Every existing
-- RLS policy tests `role = 'admin'`, so a warehouse account is, to PostgREST,
-- exactly a customer: it reads its own rows and nothing else. Everything the
-- warehouse sees comes through `/api/warehouse/*` on the service role, shaped by
-- DTOs that carry no prices, payments or email addresses.
--
-- WHY A PACKAGE IS NOT A consolidation_box. A box (048) is a pricing object: one
-- customer's bag, packed by weight to compute freight and the consolidation
-- saving, with a departure date. A package is a physical object on a shelf: what
-- an operator actually taped shut. They usually coincide and often do not — a box
-- over capacity becomes two packages; a single-item order ships without a box.
-- So the package references orders directly and the box is derived on read.

BEGIN;

-- ── The role ────────────────────────────────────────────────────────────────
-- The CHECK in 001 was declared inline, so its name is Postgres's default. Drop
-- whatever CHECK constrains `role` by definition rather than by guessed name.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.audit_logs'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%actor_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('system', 'admin', 'user', 'warehouse'));
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_role_check CHECK (actor_role IN ('user', 'admin', 'system', 'warehouse'));

-- ── warehouse_packages ──────────────────────────────────────────────────────
-- A short, speakable number for the same reason `orders.order_no` has one (050):
-- it is typed into the lookup box when a label is torn, and read over the phone.
CREATE SEQUENCE IF NOT EXISTS warehouse_package_no_seq AS BIGINT START WITH 10001 MINVALUE 1;
GRANT USAGE, SELECT ON SEQUENCE warehouse_package_no_seq TO service_role;

CREATE TABLE IF NOT EXISTS warehouse_packages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_no         BIGINT NOT NULL DEFAULT nextval('warehouse_package_no_seq'),
  reference          TEXT GENERATED ALWAYS AS ('PKG-' || package_no::text) STORED,
  -- packing: open on the bench, items going in and out.
  -- sealed:  taped and labelled; contents frozen until reopened.
  -- shipped: left the hub. Every order inside moved to `in_transit`.
  status             TEXT NOT NULL DEFAULT 'packing'
                       CHECK (status IN ('packing', 'sealed', 'shipped')),
  service            TEXT NOT NULL DEFAULT 'air' CHECK (service IN ('air', 'sea')),
  origin             TEXT NOT NULL DEFAULT 'New York, USA' CHECK (length(btrim(origin)) > 0),
  destination        TEXT NOT NULL DEFAULT 'Accra, Ghana' CHECK (length(btrim(destination)) > 0),
  weight_lbs         NUMERIC(8, 2) CHECK (weight_lbs IS NULL OR weight_lbs > 0),
  length_in          NUMERIC(6, 1) CHECK (length_in IS NULL OR length_in > 0),
  width_in           NUMERIC(6, 1) CHECK (width_in IS NULL OR width_in > 0),
  height_in          NUMERIC(6, 1) CHECK (height_in IS NULL OR height_in > 0),
  -- The air waybill or the forwarder's tracking number, once there is one.
  carrier            TEXT CHECK (carrier IS NULL OR length(carrier) <= 80),
  tracking_number    TEXT CHECK (tracking_number IS NULL OR length(tracking_number) <= 80),
  fragile            BOOLEAN NOT NULL DEFAULT false,
  this_way_up        BOOLEAN NOT NULL DEFAULT true,
  keep_dry           BOOLEAN NOT NULL DEFAULT false,
  notes              TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sealed_at          TIMESTAMPTZ,
  sealed_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  shipped_at         TIMESTAMPTZ,
  shipped_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  label_printed_at   TIMESTAMPTZ,
  label_print_count  INT NOT NULL DEFAULT 0 CHECK (label_print_count >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_packages_sealed_has_time CHECK (status = 'packing' OR sealed_at IS NOT NULL),
  CONSTRAINT warehouse_packages_shipped_has_time CHECK (status <> 'shipped' OR shipped_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_packages_no ON warehouse_packages (package_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_packages_reference ON warehouse_packages (reference);
CREATE INDEX IF NOT EXISTS idx_warehouse_packages_status ON warehouse_packages (status, updated_at DESC);

-- ── warehouse_package_items ─────────────────────────────────────────────────
-- An item is an order (one product line) or, for things that arrived outside the
-- order system (a sourcing buy, a returned part), a described line. An order can
-- sit in ONE package at a time — the unique index is what makes "add to package"
-- safe against two operators packing the same parcel at once.
CREATE TABLE IF NOT EXISTS warehouse_package_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   UUID NOT NULL REFERENCES warehouse_packages(id) ON DELETE CASCADE,
  order_id     UUID REFERENCES orders(id) ON DELETE RESTRICT,
  description  TEXT CHECK (description IS NULL OR length(btrim(description)) BETWEEN 1 AND 200),
  quantity     INT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  added_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_package_items_has_subject CHECK (order_id IS NOT NULL OR description IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_package_items_order
  ON warehouse_package_items (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_package_items_package
  ON warehouse_package_items (package_id, created_at);

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_warehouse_packages_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_warehouse_packages_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_warehouse_packages_updated_at ON warehouse_packages;
CREATE TRIGGER trg_warehouse_packages_updated_at
  BEFORE UPDATE ON warehouse_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_warehouse_packages_updated_at();

-- ── RLS: service role only ──────────────────────────────────────────────────
-- No policy for `authenticated` at all, admin included. The package holds a
-- customer's name, phone and address next to every other customer's in the same
-- box; the only reader is the warehouse API, which checks the role itself.
ALTER TABLE warehouse_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_package_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON warehouse_packages FROM anon, authenticated;
REVOKE ALL ON warehouse_package_items FROM anon, authenticated;
GRANT ALL ON warehouse_packages TO service_role;
GRANT ALL ON warehouse_package_items TO service_role;

-- ── The return address printed on every label ───────────────────────────────
-- Not public: it is a street address staff print, not marketing copy. Blank
-- fields are simply left off the label, so this is safe to ship unfilled and
-- edit from /admin/content.
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('warehouse_address',
   '{"name":"Tomame US Hub","line1":"","line2":"","city":"New York, NY","phone":"","email":""}'::jsonb,
   'Warehouse return address',
   'Printed on every package label as the return address. Keys: name, line1, line2, city, phone, email. Blank fields are left off.',
   false)
ON CONFLICT (key) DO NOTHING;

COMMIT;
