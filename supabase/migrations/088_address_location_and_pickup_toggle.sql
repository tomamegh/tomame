-- Migration 088: "Use my current location" on addresses, and an admin switch for pickup.
--
-- LOCATION. A saved address can carry the customer's map pin. In Ghana a typed
-- street address often cannot get a courier to the door; the pin can. Both
-- columns or neither, in range. NUMERIC(9,6) is ~11 cm, far finer than a phone fix.
--
-- Turning the pin into words (street, area, city) is a reverse-geocode lookup
-- against Google. It is OFF until an admin has a key: the "Use my location"
-- button still records the pin without it, and the customer types the rest.
--
-- PICKUP. `pickup_enabled` hides the pickup tile and makes the server refuse a
-- pickup checkout, so the only way to check out is a door address.
--
-- google_maps_api_key is PRIVATE (is_public = false): anon and customers cannot
-- read it (036's policy is USING (is_public)); only the service role and admins.
-- A GOOGLE_MAPS_API_KEY env var, when set, wins over this row.

BEGIN;

ALTER TABLE delivery_addresses
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

ALTER TABLE delivery_addresses DROP CONSTRAINT IF EXISTS delivery_addresses_location_pair;
ALTER TABLE delivery_addresses ADD CONSTRAINT delivery_addresses_location_pair CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

COMMENT ON COLUMN delivery_addresses.latitude IS
  'Map pin from the customer''s device ("Use my current location"), 088. Null when the address was typed.';
COMMENT ON COLUMN delivery_addresses.longitude IS
  'Map pin from the customer''s device, 088. Set together with latitude or not at all.';

INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('pickup_enabled', 'true'::jsonb,
   'Pickup at checkout',
   'Whether customers can choose a pickup point in the bag. Off: the pickup option disappears and every checkout needs a door address.',
   true),
  ('address_lookup_enabled', 'false'::jsonb,
   'Address lookup from location',
   'When a customer taps "Use my current location", fill the street, area and city from Google Maps. Needs the Google Maps API key below. Off: the map pin is still saved and the customer types the address.',
   false),
  ('google_maps_api_key', '""'::jsonb,
   'Google Maps API key',
   'Server-side key with the Geocoding API enabled. Never shown to customers. A GOOGLE_MAPS_API_KEY environment variable overrides this.',
   false)
ON CONFLICT (key) DO NOTHING;

COMMIT;
