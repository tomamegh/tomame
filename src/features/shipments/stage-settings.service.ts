import "server-only";

import { listStageSettingRows } from "@/db/queries/shipment-stage-settings";
import { logger } from "@/lib/logger";

import { settingsByStage, type ShipmentStageKey, type StageSetting } from "./stages";

/**
 * Stage wording and contacts (098), defaults filling any gap. Never throws: a
 * read failure costs the customer the phone numbers, not the order page.
 */
export async function loadStageSettings(): Promise<Record<ShipmentStageKey, StageSetting>> {
  try {
    return settingsByStage(await listStageSettingRows());
  } catch (error) {
    logger.warn("stage settings unavailable", { error: error instanceof Error ? error.message : String(error) });
    return settingsByStage([]);
  }
}
