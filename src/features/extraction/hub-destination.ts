import { logger } from "@/lib/logger";
import type { Region } from "./url";

/**
 * Where a store ships to: the Tomame hub. eBay prices shipping per destination
 * and per service, so the quote must ask for the hub's zip, not the vendor's
 * proxy location (a seller in North Carolina quoted $23 to a west-coast proxy
 * and $14 to New York, 2026-10-11).
 *
 * The zip lives in `site_settings.warehouse_address.postal_code`, edited from
 * the admin content screen. Until it is set, New York's 10001 stands in and a
 * warning is logged; the city is right, the rate may be off by a dollar or two.
 */
export interface HubDestination {
  country: string;
  zip: string | null;
}

const DEFAULT_US_ZIP = "10001";
const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; zip: string | null } | null = null;

export async function hubUsZip(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.zip;
  let zip: string | null = null;
  try {
    // Loaded on first use: the chain and its tests import this module, and the
    // query module pulls in the server-only admin client.
    const { getWarehouseAddress } = await import("@/db/queries/warehouse");
    const address = await getWarehouseAddress();
    const raw = address?.postal_code ?? address?.zip;
    if (typeof raw === "string" && /^\d{5}(-\d{4})?$/.test(raw.trim())) zip = raw.trim().slice(0, 5);
  } catch (err) {
    logger.warn("hub destination: warehouse address unreadable", { error: err instanceof Error ? err.message : String(err) });
  }
  cache = { at: Date.now(), zip };
  return zip;
}

/** Test seam. */
export function resetHubDestinationCache(): void {
  cache = null;
}

/** The destination for a listing from `region`. UK listings go to the UK forwarder with no zip. */
export async function hubDestinationFor(region: Region | null): Promise<HubDestination> {
  if (region === "UK") return { country: "GB", zip: null };
  const zip = await hubUsZip();
  if (!zip) logger.warn("hub destination: warehouse_address.postal_code is not set; using the New York default", { zip: DEFAULT_US_ZIP });
  return { country: "US", zip: zip ?? DEFAULT_US_ZIP };
}
