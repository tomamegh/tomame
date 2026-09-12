import "server-only";
import { getRegionByCode, type RegionRow } from "@/db/queries/regions";
import { listActiveDeliveryZones, type DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { pickDefaultDoorZone } from "@/features/delivery/zones";
import type { DeliveryWindow, QuoteConstants } from "../types";
import { loadQuoteConstants } from "./quote-constants.service";

/** Origin codes as `regions.code` spells them. */
export type EtaCountry = "USA" | "UK" | "CHINA";

export interface DeliveryWindowInput {
  country: EtaCountry;
  constants: Pick<QuoteConstants, "purchase_lead_days_min" | "purchase_lead_days_max">;
  /** The `regions` row for `country`, or null when it is not configured. */
  region: RegionRow | null;
  /** The zone the estimate assumes; null adds no zone days. */
  zone: DeliveryZoneRow | null;
  today: Date;
}

/**
 * from = today + lead_min + transit_min + zone.extra_days
 * to   = today + lead_max + transit_max + zone.extra_days
 *
 * Null when the region has no transit days: an ETA with a made-up transit is
 * worse than none. Dates are UTC calendar days — Ghana is UTC all year.
 */
export function estimateDeliveryWindow(input: DeliveryWindowInput): DeliveryWindow | null {
  const { region, zone, constants, today } = input;
  if (!region || region.code !== input.country) return null;
  if (region.transit_days_min == null || region.transit_days_max == null) return null;

  const extra = zone?.extra_days ?? 0;
  return {
    from: toDateString(addDays(today, constants.purchase_lead_days_min + region.transit_days_min + extra)),
    to: toDateString(addDays(today, constants.purchase_lead_days_max + region.transit_days_max + extra)),
  };
}

/**
 * Region + default door zone + constants → window. `constants` is passed in when
 * the caller already holds the map (the lock service does); otherwise loaded.
 */
export async function loadDeliveryWindow(
  country: EtaCountry,
  constants: QuoteConstants | null,
  today: Date,
): Promise<DeliveryWindow | null> {
  const [region, zones, resolvedConstants] = await Promise.all([
    getRegionByCode(country),
    listActiveDeliveryZones(),
    constants ? Promise.resolve(constants) : loadQuoteConstants(),
  ]);
  return estimateDeliveryWindow({
    country,
    constants: resolvedConstants,
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
