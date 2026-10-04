import "server-only";
import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { getServerSiteSettings } from "@/db/queries/site-settings";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { matchDoorZone, parseGeocodeResults, type GeocodeResult, type LocatedAddress } from "../location";
import type { LocateInput } from "../schema";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 6_000;

/**
 * - `filled`: Google answered; `address` holds what it knew.
 * - `off`: lookup is switched off or has no key — the pin is still saved.
 * - `failed`: the call went wrong; the customer types the address.
 * Never throws: a lookup is a convenience on top of a form that works without it.
 */
export type LocateResult =
  | { lookup: "filled"; address: LocatedAddress; delivery_zone_id: string | null }
  | { lookup: "off" | "failed"; address: null; delivery_zone_id: null };

const NONE = { address: null, delivery_zone_id: null } as const;

export async function locateAddress(input: LocateInput): Promise<LocateResult> {
  const key = await resolveLookupKey();
  if (!key) return { lookup: "off", ...NONE };

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("latlng", `${input.latitude},${input.longitude}`);
  url.searchParams.set("region", "gh");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { status?: string; error_message?: string; results?: GeocodeResult[] } | null;
    if (!res.ok || !body || (body.status !== "OK" && body.status !== "ZERO_RESULTS")) {
      // REQUEST_DENIED is a bad or unrestricted-wrong key: ops needs to see it.
      logger.error("address lookup: geocode refused", { httpStatus: res.status, status: body?.status, message: body?.error_message });
      return { lookup: "failed", ...NONE };
    }
    const address = parseGeocodeResults(body.results ?? []);
    const zones = await listActiveDeliveryZones();
    return { lookup: "filled", address, delivery_zone_id: matchDoorZone(address, zones) };
  } catch (error) {
    logger.warn("address lookup: geocode call failed", { error: error instanceof Error ? error.message : String(error) });
    return { lookup: "failed", ...NONE };
  }
}

/**
 * The key to use, or null when lookup should not run: the admin switch
 * (`address_lookup_enabled`) must be on, and a key must exist — env first,
 * then the private `google_maps_api_key` row.
 */
async function resolveLookupKey(): Promise<string | null> {
  try {
    const settings = await getServerSiteSettings(["address_lookup_enabled", "google_maps_api_key"]);
    if (settings.address_lookup_enabled !== true) return null;
    const stored = typeof settings.google_maps_api_key === "string" ? settings.google_maps_api_key.trim() : "";
    return env.maps.googleApiKey || stored || null;
  } catch (error) {
    logger.warn("address lookup: could not read settings; lookup off", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
