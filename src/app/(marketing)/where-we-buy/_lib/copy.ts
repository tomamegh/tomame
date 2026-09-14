import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { RegionRow } from "@/db/queries/regions";

import { regionShortName } from "./lane-map-nodes";

/**
 * Hero copy for Where we buy, composed from the live `regions` and
 * `delivery_zones` rows.
 *
 * The mock hard-codes "From the USA to your door in Ghana" and lists five
 * cities by hand. Both go stale the day an admin opens the UK lane or adds a
 * zone, so the sentence is assembled here instead. Pure string work — no data
 * access, no business rules.
 */

/** "Accra", "Accra and Kumasi", "Accra, Kumasi and Ho". */
export function joinWithAnd(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] ?? ""}`;
}

/** Region names as the headline says them: "USA", "USA and UK". */
export function laneNames(regions: readonly RegionRow[]): string {
  return joinWithAnd(regions.map(regionShortName));
}

/**
 * Place names out of the door zones.
 *
 * Zone names are admin copy in the shape "Cape Coast · Tamale · Ho" or
 * "Greater Accra · door delivery", so each is split on the middot and the
 * service qualifier ("door delivery", "pickup") dropped — what is left is the
 * list of places the sentence wants.
 */
export function deliveryPlaces(zones: readonly DeliveryZoneRow[]): string[] {
  const places: string[] = [];
  for (const zone of zones) {
    if (zone.kind !== "door") continue;
    for (const part of zone.name.split("·")) {
      const place = part.trim();
      if (!place || /\b(door|pickup|delivery|collection)\b/i.test(place)) {
        continue;
      }
      if (!places.includes(place)) places.push(place);
    }
  }
  return places;
}

export interface HeroCopyInput {
  live: readonly RegionRow[];
  soon: readonly RegionRow[];
  zones: readonly DeliveryZoneRow[];
  hasPickup: boolean;
}

export interface HeroCopy {
  heading: string;
  body: string;
}

export function buildHeroCopy({
  live,
  soon,
  zones,
  hasPickup,
}: HeroCopyInput): HeroCopy {
  const liveNames = laneNames(live);
  const soonNames = laneNames(soon);
  const places = deliveryPlaces(zones);

  const heading = liveNames
    ? `From the ${liveNames} to your door in Ghana.`
    : "To your door in Ghana.";

  const source = liveNames ? `any ${liveNames} store` : "any store we cover";
  const sentences = [
    `Paste a link from ${source} and we work out the freight and the timeline.`,
  ];

  if (places.length > 0) {
    sentences.push(
      `Deliveries go to ${joinWithAnd(places)}${hasPickup ? ", or any pickup point" : ""}.`,
    );
  }

  if (soonNames) {
    sentences.push(
      `${soonNames} ${soon.length > 1 ? "are" : "is"} coming soon.`,
    );
  }

  return { heading, body: sentences.join(" ") };
}
