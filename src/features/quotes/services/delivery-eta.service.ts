import "server-only";
import { getRegionByCode, type RegionRow } from "@/db/queries/regions";
import { listActiveDeliveryZones, type DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { pickDefaultDoorZone } from "@/features/delivery/zones";
import type { DeliveryWindow } from "../types";

/** Origin codes as `regions.code` spells them. */
export type EtaCountry = "USA" | "UK" | "CHINA";

export interface DeliveryWindowInput {
  country: EtaCountry;
  /** The `regions` row for `country`, or null when it is not configured. */
  region: RegionRow | null;
  /** The zone the estimate assumes; null adds no zone days. */
  zone: DeliveryZoneRow | null;
  today: Date;
}

/**
 * from = today + transit_min + zone.extra_days
 * to   = today + transit_max + zone.extra_days
 *
 * `regions.transit_days_*` is the published door-to-door promise counted from
 * payment ("5–7 days" on the marketing site), so the store-purchase lead time is
 * inside it, not added on top — adding `purchase_lead_days_*` made the quote's
 * dates run past the window the site advertises.
 *
 * Null when the region has no transit days: an ETA with a made-up transit is
 * worse than none. Dates are UTC calendar days — Ghana is UTC all year.
 */
export function estimateDeliveryWindow(input: DeliveryWindowInput): DeliveryWindow | null {
  const { region, zone, today } = input;
  if (!region || region.code !== input.country) return null;
  if (region.transit_days_min == null || region.transit_days_max == null) return null;

  const extra = zone?.extra_days ?? 0;
  return {
    from: toDateString(addDays(today, region.transit_days_min + extra)),
    to: toDateString(addDays(today, region.transit_days_max + extra)),
  };
}

/** Region + default door zone → window. */
export async function loadDeliveryWindow(country: EtaCountry, today: Date): Promise<DeliveryWindow | null> {
  const [region, zones] = await Promise.all([getRegionByCode(country), listActiveDeliveryZones()]);
  return estimateDeliveryWindow({
    country,
    region,
    zone: pickDefaultDoorZone(zones),
    today,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
