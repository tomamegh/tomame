-- 124: a moved or cancelled flight re-dates its orders (Seamless Roadmap, Initiative 2).
--
-- * `order_firm_dates`: every firm door date a customer is given, in order. The
--   first comes with the store's tracking; a later one only when the flight it
--   rides moves or is cancelled. Read against `delivered_at` for the promise
--   accuracy numbers. Server-only: no customer reads it.
-- * `move_flight_departure` / `cancel_flight_departure`: the two ops actions on
--   the admin boxes screen. A move to another day leaves the old day CANCELLED
--   (so `run_box_schedule()` never regenerates it) and opens the new day; the
--   boxes and packages on the flight follow it. A cancel sends them to the
--   region's next scheduled flight.

BEGIN;

CREATE TABLE IF NOT EXISTS order_firm_dates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_on   DATE NOT NULL,
  flight_on     DATE NOT NULL,
  basis         TEXT NOT NULL CHECK (basis IN ('flown', 'hub_arrival', 'expected_hub_arrival')),
  reason        TEXT NOT NULL CHECK (reason IN ('store_tracking', 'departure_moved', 'departure_cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_firm_dates IS
  '124: each firm delivery date given for an order, oldest first. Written when store tracking lands and when its flight moves or is cancelled.';

CREATE INDEX IF NOT EXISTS idx_order_firm_dates_order ON order_firm_dates (order_id, created_at DESC);

ALTER TABLE order_firm_dates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_firm_dates FROM anon, authenticated;
GRANT ALL ON order_firm_dates TO service_role;

-- ── Move ─────────────────────────────────────────────────────────────────────
-- Returns the departure the flight now is: the same row when only the time
-- changed, a new row when the day changed.
CREATE OR REPLACE FUNCTION move_flight_departure(p_id UUID, p_departs_at TIMESTAMPTZ, p_cutoff_at TIMESTAMPTZ)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old flight_departures%ROWTYPE;
  v_day DATE := (p_departs_at AT TIME ZONE 'UTC')::DATE;
  v_new UUID;
BEGIN
  SELECT * INTO v_old FROM flight_departures WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'departure_not_found'; END IF;
  IF v_old.status NOT IN ('scheduled', 'closed') THEN RAISE EXCEPTION 'departure_not_movable'; END IF;
  IF p_cutoff_at > p_departs_at THEN RAISE EXCEPTION 'cutoff_after_departure'; END IF;

  IF v_day = v_old.departs_on THEN
    UPDATE flight_departures
    SET departs_at = p_departs_at, cutoff_at = p_cutoff_at,
        status = CASE WHEN p_cutoff_at > now() THEN 'scheduled' ELSE 'closed' END,
        updated_at = now()
    WHERE id = p_id;
    v_new := p_id;
  ELSE
    IF EXISTS (SELECT 1 FROM flight_departures
               WHERE region_code = v_old.region_code AND departs_on = v_day AND status <> 'cancelled') THEN
      RAISE EXCEPTION 'day_taken';
    END IF;
    -- A cancelled row on the new day (an earlier move or cancel) is reused.
    DELETE FROM flight_departures
    WHERE region_code = v_old.region_code AND departs_on = v_day AND status = 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM consolidation_boxes b WHERE b.departure_id = flight_departures.id)
      AND NOT EXISTS (SELECT 1 FROM warehouse_packages p WHERE p.departure_id = flight_departures.id);
    IF EXISTS (SELECT 1 FROM flight_departures WHERE region_code = v_old.region_code AND departs_on = v_day) THEN
      RAISE EXCEPTION 'day_taken';
    END IF;

    INSERT INTO flight_departures (region_code, carrier, origin, destination, departs_on, departs_at, cutoff_at, status, awb)
    VALUES (v_old.region_code, v_old.carrier, v_old.origin, v_old.destination, v_day, p_departs_at, p_cutoff_at,
            CASE WHEN p_cutoff_at > now() THEN 'scheduled' ELSE 'closed' END, v_old.awb)
    RETURNING id INTO v_new;

    UPDATE flight_departures SET status = 'cancelled', updated_at = now() WHERE id = p_id;
    UPDATE warehouse_packages SET departure_id = v_new WHERE departure_id = p_id;
  END IF;

  -- Boxes still on the ground ride the flight at its new time.
  UPDATE consolidation_boxes
  SET departure_id = v_new, departs_at = p_departs_at, cutoff_at = p_cutoff_at, updated_at = now()
  WHERE departure_id = p_id AND status IN ('open', 'closed');

  RETURN v_new;
END;
$$;

-- ── Cancel ───────────────────────────────────────────────────────────────────
-- Returns the departure everything moved to, or NULL when the region has none.
CREATE OR REPLACE FUNCTION cancel_flight_departure(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old flight_departures%ROWTYPE;
  v_next flight_departures%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM flight_departures WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'departure_not_found'; END IF;
  IF v_old.status NOT IN ('scheduled', 'closed') THEN RAISE EXCEPTION 'departure_not_movable'; END IF;

  UPDATE flight_departures SET status = 'cancelled', updated_at = now() WHERE id = p_id;

  SELECT * INTO v_next FROM flight_departures
  WHERE region_code = v_old.region_code AND status = 'scheduled'
    AND departs_at > v_old.departs_at AND id <> p_id
  ORDER BY departs_at
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE warehouse_packages SET departure_id = v_next.id WHERE departure_id = p_id;
  UPDATE consolidation_boxes
  SET departure_id = v_next.id, departs_at = v_next.departs_at, cutoff_at = v_next.cutoff_at, updated_at = now()
  WHERE departure_id = p_id AND status IN ('open', 'closed');

  RETURN v_next.id;
END;
$$;

REVOKE ALL ON FUNCTION move_flight_departure(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cancel_flight_departure(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION move_flight_departure(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_flight_departure(UUID) TO service_role;

COMMIT;
