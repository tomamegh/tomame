import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";

/**
 * The zone a quote assumes before the customer has chosen one: the first active
 * door-delivery zone by sort_order (Greater Accra today). Pure so the UI and the
 * ETA service pick the same zone from the same list; no `server-only` here on
 * purpose.
 */
export function pickDefaultDoorZone(zones: readonly DeliveryZoneRow[]): DeliveryZoneRow | null {
  const doors = zones.filter((zone) => zone.kind === "door");
  if (doors.length === 0) return null;
  return doors.reduce((best, zone) => (zone.sort_order < best.sort_order ? zone : best));
}
