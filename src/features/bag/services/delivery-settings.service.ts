import "server-only";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { logger } from "@/lib/logger";

/**
 * `site_settings.pickup_enabled` (088) — the admin's switch for the pickup tile.
 *
 * Only a stored `false` turns pickup off. A missing row or a failed read keeps
 * it on: that is how the bag behaved before the switch existed, and a settings
 * hiccup must not take a delivery option away mid-checkout.
 */
export async function isPickupEnabled(): Promise<boolean> {
  try {
    return (await getSiteSettingsMap()).pickup_enabled !== false;
  } catch (error) {
    logger.warn("bag: could not read pickup_enabled; leaving pickup on", {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
