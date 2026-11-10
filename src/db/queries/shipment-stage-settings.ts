import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ShipmentStageKey, StageSetting } from "@/features/shipments/stages";

/**
 * `shipment_stage_settings` (098): per step, the customer's wording and the
 * number to call. Service role only — the table has no `authenticated` grant;
 * the customer's journey reads it through the server.
 */

const COLUMNS =
  "stage, title, description, contact_name, contact_phone, contact_whatsapp, contact_hours, typical_days";

export async function listStageSettingRows(): Promise<StageSetting[]> {
  const { data, error } = await createAdminClient().from("shipment_stage_settings").select(COLUMNS);
  if (error) throw new Error(`Failed to load stage settings: ${error.message}`);
  return (data ?? []) as StageSetting[];
}

export async function upsertStageSettingRow(
  row: Omit<StageSetting, "stage"> & { stage: ShipmentStageKey; updated_by: string },
): Promise<StageSetting> {
  const { data, error } = await createAdminClient()
    .from("shipment_stage_settings")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "stage" })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to save the stage: ${error.message}`);
  return data as StageSetting;
}
