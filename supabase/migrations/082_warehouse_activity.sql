-- Migration 082: what the warehouse does between mutations — and a way to read it.
--
-- Kelvin's brief (2026-09-30): an admin should be able to see how the hub is
-- working — who is on shift, what they looked at, what they scanned and could
-- not find — not only the rows `audit_logs` gets when something changes.
--
-- WHY NOT audit_logs. `audit_logs` is the compliance record: one row per state
-- change, append-only, and read as "who changed this". A page view is not a state
-- change, and ten of them a minute from a tablet on the bench would bury the rows
-- that are. So the reads go here, and the admin's timeline (`/admin/warehouse`)
-- merges the two on the way out through `warehouse_activity_feed()` below.
--
-- WHO WRITES. Only the service role, from `/api/warehouse/activity` (page views,
-- posted by a beacon in the warehouse shell) and from inside the warehouse
-- service (scans, failed lookups, label views). The actor is always the session's
-- user, never a field in a request body. Nothing in the code updates or deletes a
-- row; retention is the cron job at the bottom.
--
-- WHO READS. Admins, through `/admin/warehouse` on the service role. No policy
-- for `authenticated` at all: an operator must not be able to read a colleague's
-- trail, or their own, through PostgREST.

BEGIN;

-- ── warehouse_activity ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_role    TEXT NOT NULL CHECK (actor_role IN ('admin', 'warehouse')),
  -- page_view:     a /warehouse screen was opened (the beacon).
  -- scan:          a code resolved to a package or an order.
  -- lookup_failed: a code resolved to nothing — a torn label, a typo, a parcel
  --                that is not ours. The one kind an admin should act on.
  -- label_view:    a package's print surface was opened. The PRINT itself is
  --                already `warehouse_label_printed` in audit_logs.
  kind          TEXT NOT NULL CHECK (kind IN ('page_view', 'scan', 'lookup_failed', 'label_view')),
  -- A pathname only, never a query string: a search box's contents do not
  -- belong in a trail an admin browses.
  path          TEXT CHECK (path IS NULL OR length(path) <= 300),
  subject_type  TEXT CHECK (subject_type IS NULL OR subject_type IN ('warehouse_package', 'order')),
  subject_id    UUID,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb
                  CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 2048),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_activity_subject_pair CHECK ((subject_type IS NULL) = (subject_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_warehouse_activity_created
  ON warehouse_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_activity_actor
  ON warehouse_activity (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_activity_subject
  ON warehouse_activity (subject_id, created_at DESC) WHERE subject_id IS NOT NULL;

-- The timeline pages `audit_logs` newest-first; until now it was only ever read
-- by entity. An index, not a change to the table — the log stays append-only.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC);

-- ── RLS: service role only ──────────────────────────────────────────────────
ALTER TABLE warehouse_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON warehouse_activity FROM anon, authenticated;
GRANT SELECT, INSERT ON warehouse_activity TO service_role;

-- ── The staff directory ─────────────────────────────────────────────────────
-- Names for the timeline and the operator filter. `auth.users` is joined for the
-- address a nameless account falls back to; that is why this is SECURITY DEFINER
-- and why only the service role may call it.
CREATE OR REPLACE FUNCTION public.warehouse_staff()
RETURNS TABLE (id UUID, role TEXT, first_name TEXT, last_name TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.role, p.first_name::text, p.last_name::text, u.email::text
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE p.role IN ('warehouse', 'admin');
$$;
REVOKE ALL ON FUNCTION public.warehouse_staff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_staff() TO service_role;

-- ── The timeline ────────────────────────────────────────────────────────────
-- One newest-first stream over both tables, keyset-paged on (created_at, id) so
-- a page boundary never drops or repeats a row, whichever table it came from.
--
-- An audit row belongs to the warehouse when its action is a `warehouse_*` one,
-- one of the parcel actions the platform performs (holds, photos, customer
-- feedback), or when its actor is a warehouse operator — everything an operator
-- does is the warehouse's business, a sign-in included.
--
-- Filters are all optional. `p_actions` / `p_kinds` NULL means "every", an EMPTY
-- array means "none from this table" — which is how a filter that only names
-- activity kinds leaves the audit half out. `p_subject` / `p_code` match a
-- package or order by id (entity, metadata ids) or by its printed reference.
CREATE OR REPLACE FUNCTION public.warehouse_activity_feed(
  p_limit     INT DEFAULT 30,
  p_before    TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL,
  p_since     TIMESTAMPTZ DEFAULT NULL,
  p_until     TIMESTAMPTZ DEFAULT NULL,
  p_actor     UUID DEFAULT NULL,
  p_actions   TEXT[] DEFAULT NULL,
  p_kinds     TEXT[] DEFAULT NULL,
  p_subject   UUID DEFAULT NULL,
  p_code      TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID, source TEXT, action TEXT, actor_id UUID, actor_role TEXT,
  entity_type TEXT, entity_id UUID, path TEXT, metadata JSONB, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH audit AS (
    SELECT l.id, 'audit'::text AS source, l.action, l.actor_id, l.actor_role,
           l.entity_type, l.entity_id, NULL::text AS path, l.metadata, l.created_at
      FROM audit_logs l
     WHERE (l.action LIKE 'warehouse\_%'
            OR l.action IN ('order_held', 'order_hold_released', 'order_feedback_updated',
                            'order_photo_uploaded', 'order_photo_deleted')
            OR l.actor_role = 'warehouse'
            OR l.actor_id IN (SELECT pr.id FROM profiles pr WHERE pr.role = 'warehouse'))
       AND (p_actions IS NULL OR l.action = ANY (p_actions))
       AND (p_actor IS NULL OR l.actor_id = p_actor)
       AND (p_since IS NULL OR l.created_at >= p_since)
       AND (p_until IS NULL OR l.created_at < p_until)
       AND ((p_subject IS NULL AND p_code IS NULL)
            OR l.entity_id = p_subject
            OR l.metadata->>'order_id' = p_subject::text
            OR l.metadata->>'orderId' = p_subject::text
            OR (jsonb_typeof(l.metadata->'order_ids') = 'array' AND l.metadata->'order_ids' ? p_subject::text)
            OR l.metadata->>'reference' = p_code
            OR l.metadata->>'order_no' = p_code
            OR l.metadata->>'orderNo' = p_code)
       AND (p_before IS NULL OR (l.created_at, l.id) < (p_before, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT GREATEST(1, LEAST(p_limit, 200))
  ),
  activity AS (
    SELECT w.id, 'activity'::text AS source, w.kind AS action, w.actor_id, w.actor_role,
           w.subject_type AS entity_type, w.subject_id AS entity_id, w.path, w.metadata, w.created_at
      FROM warehouse_activity w
     WHERE (p_kinds IS NULL OR w.kind = ANY (p_kinds))
       AND (p_actor IS NULL OR w.actor_id = p_actor)
       AND (p_since IS NULL OR w.created_at >= p_since)
       AND (p_until IS NULL OR w.created_at < p_until)
       AND ((p_subject IS NULL AND p_code IS NULL)
            OR w.subject_id = p_subject
            OR w.metadata->>'code' = p_code)
       AND (p_before IS NULL OR (w.created_at, w.id) < (p_before, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
     ORDER BY w.created_at DESC, w.id DESC
     LIMIT GREATEST(1, LEAST(p_limit, 200))
  )
  SELECT * FROM (SELECT * FROM audit UNION ALL SELECT * FROM activity) merged
   ORDER BY merged.created_at DESC, merged.id DESC
   LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;
REVOKE ALL ON FUNCTION public.warehouse_activity_feed(INT, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT[], UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_activity_feed(INT, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT[], UUID, TEXT)
  TO service_role;

-- ── Per-operator counts ─────────────────────────────────────────────────────
-- Page views run to thousands over 90 days; they are counted here rather than
-- shipped to the app to be counted.
CREATE OR REPLACE FUNCTION public.warehouse_activity_summary(p_since TIMESTAMPTZ)
RETURNS TABLE (actor_id UUID, kind TEXT, events BIGINT, last_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.actor_id, w.kind, count(*)::bigint, max(w.created_at)
    FROM warehouse_activity w
   WHERE w.created_at >= p_since
   GROUP BY w.actor_id, w.kind;
$$;
REVOKE ALL ON FUNCTION public.warehouse_activity_summary(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_activity_summary(TIMESTAMPTZ) TO service_role;

-- ── Retention ───────────────────────────────────────────────────────────────
-- A read trail older than the page's longest range (90 days) answers nothing.
-- Pure SQL, like `cleanup-error-events` (062). audit_logs is never touched.
SELECT cron.unschedule('cleanup-warehouse-activity')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-warehouse-activity');

SELECT cron.schedule('cleanup-warehouse-activity', '55 3 * * *', $$
  DELETE FROM warehouse_activity WHERE created_at < now() - interval '120 days';
$$);

COMMIT;
