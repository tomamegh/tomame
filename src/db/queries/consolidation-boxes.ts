import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type BoxStatus = "open" | "closed" | "in_transit" | "landed" | "archived";

/** 111: why a box closed. */
export type BoxClosedReason = "cutoff" | "capacity" | "staff";

export interface ConsolidationBoxRow {
  id: string;
  /** 111: BX-1001… the box's name everywhere. */
  code: string;
  region_code: string;
  label: string | null;
  capacity_lbs: number;
  cutoff_at: string | null;
  departs_at: string | null;
  status: BoxStatus;
  /** 111: the departure this box rides. Null = unscheduled. */
  departure_id: string | null;
  closed_at: string | null;
  closed_reason: BoxClosedReason | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsolidationBoxInsert {
  region_code: string;
  label: string | null;
  capacity_lbs: number;
  cutoff_at: string | null;
  departs_at: string | null;
  departure_id: string | null;
}

const COLUMNS =
  "id, code, region_code, label, capacity_lbs, cutoff_at, departs_at, status, departure_id, closed_at, closed_reason, archived_at, created_at, updated_at";

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
  patch: Partial<Pick<ConsolidationBoxRow, "label" | "capacity_lbs" | "cutoff_at" | "departs_at" | "departure_id">>,
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

/** 111: a staff close. Guarded on `open`, so a box closed meanwhile is not closed twice. */
export async function closeOpenBox(id: string, closedBy: string): Promise<ConsolidationBoxRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("consolidation_boxes")
    .update({ status: "closed", closed_at: now, closed_reason: "staff", closed_by: closedBy, updated_at: now })
    .eq("id", id)
    .eq("status", "open")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to close box: ${error.message}`);
  return data ? normalizeRow(data) : null;
}

function normalizeRow(row: Record<string, unknown>): ConsolidationBoxRow {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    departure_id: (row.departure_id as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
    closed_reason: (row.closed_reason as BoxClosedReason | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
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
