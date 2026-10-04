/**
 * Pure helpers for "Use my current location" (088): reading a Google reverse
 * geocode into our address fields, and picking the door zone it falls in.
 * No I/O here so both are unit-testable; `address-lookup.service.ts` does the call.
 */

export interface GeocodeComponent {
  long_name: string;
  short_name?: string;
  types: string[];
}

export interface GeocodeResult {
  address_components?: GeocodeComponent[];
  types?: string[];
}

/** The fields a lookup can fill. Every one is a suggestion the customer can edit. */
export interface LocatedAddress {
  line1: string | null;
  area: string | null;
  city: string | null;
  region: string | null;
}

const UNNAMED = /^unnamed road$/i;

/**
 * Google returns several results, most specific first. Ghana's street data is
 * thin, so the first result is often a bare plus code: each field takes the
 * first result that has it rather than trusting result[0] for everything.
 */
export function parseGeocodeResults(results: readonly GeocodeResult[]): LocatedAddress {
  const pick = (...types: string[]): string | null => {
    for (const type of types) {
      for (const result of results) {
        const hit = result.address_components?.find((c) => c.types.includes(type) && !UNNAMED.test(c.long_name));
        if (hit) return hit.long_name.trim();
      }
    }
    return null;
  };

  const number = pick("street_number");
  const route = pick("route");
  const line1 = route ? (number ? `${number} ${route}` : route) : pick("premise", "establishment", "point_of_interest");

  return {
    line1,
    area: pick("neighborhood", "sublocality_level_1", "sublocality", "administrative_area_level_3"),
    city: pick("locality", "postal_town", "administrative_area_level_2"),
    region: pick("administrative_area_level_1"),
  };
}

export interface ZoneCandidate {
  id: string;
  name: string;
  kind: "door" | "pickup";
}

const norm = (s: string) => s.toLowerCase().replace(/\bregion\b/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The door zone whose name mentions the located city, area or region.
 *
 * Zone names are admin prose — "Greater Accra · door delivery", "Cape Coast ·
 * Tamale · Ho" — so each "·" part is a place name to match. The city is tried
 * before the region so Kumasi wins over a region-wide zone. No match → null and
 * the customer chooses; a wrong guess would charge the wrong fee.
 */
export function matchDoorZone(located: LocatedAddress, zones: readonly ZoneCandidate[]): string | null {
  const doors = zones
    .filter((z) => z.kind === "door")
    .map((z) => ({ id: z.id, places: z.name.split("·").map(norm).filter((p) => p.length >= 2 && !/delivery|door/.test(p)) }));

  for (const candidate of [located.city, located.area, located.region]) {
    if (!candidate) continue;
    const c = norm(candidate);
    if (c.length < 2) continue;
    const hit = doors.find((z) => z.places.some((p) => p === c || c.includes(p) || p.includes(c)));
    if (hit) return hit.id;
  }
  return null;
}
