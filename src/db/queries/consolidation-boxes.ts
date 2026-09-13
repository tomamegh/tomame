import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type BoxStatus = "open" | "closed" | "in_transit" | "landed";

export interface ConsolidationBoxRow {
  id: string;
  region_code: string;
  label: string | null;
  capacity_lbs: number;
  cutoff_at: string | null;
  departs_at: string | null;
  status: BoxStatus;
  created_at: string;
  updated_at: string;
}

export interface ConsolidationBoxInsert {
  region_code: string;
  label: string | null;
  capacity_lbs: number;
  cutoff_at: string | null;
  departs_at: string | null;
}

const COLUMNS = "id, region_code, label, capacity_lbs, cutoff_at, departs_at, status, created_at, updated_at";

export async function listBoxesByIds(ids: string[]): Promise<ConsolidationBoxRow[]> {
  if (ids.length === 0) return [];
  const client = createAdminClient();
  const { data, error } = await client.from("consolidation_boxes").select(COLUMNS).in("id", ids).order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load boxes: ${error.message}`);
  return (data ?? []).map(normalizeRow);
}

export async function insertBox(input: ConsolidationBoxInsert): Promise<ConsolidationBoxRow> {
  const client = createAdminClient();
  const { data, error } = await client.from("consolidation_boxes").insert({ ...input, status: "open" }).select(COLUMNS).single();
  if (error) throw new Error(`Failed to open a box: ${error.message}`);
  return normalizeRow(data);
}

/** Retarget an OPEN box's departure/label/capacity (a bag's box before anyone has paid). */
export async function updateOpenBox(
  id: string,
  patch: Partial<Pick<ConsolidationBoxRow, "label" | "capacity_lbs" | "cutoff_at" | "departs_at">>,
): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("consolidation_boxes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(`Failed to update box: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

function normalizeRow(row: Record<string, unknown>): ConsolidationBoxRow {
  return {
    id: String(row.id),
    region_code: String(row.region_code),
    label: (row.label as string | null) ?? null,
    capacity_lbs: Number(row.capacity_lbs),
    cutoff_at: (row.cutoff_at as string | null) ?? null,
    departs_at: (row.departs_at as string | null) ?? null,
    status: row.status as BoxStatus,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
