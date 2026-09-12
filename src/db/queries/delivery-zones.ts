import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

// ── Row types ───────────────────────────────────────────────────────────────

export type DeliveryZoneKind = "door" | "pickup";

export interface DeliveryZoneRow {
  id: string;
  name: string;
  kind: DeliveryZoneKind;
  /** Ghana-side delivery fee in GHS. Phase 1 displays it; Phase 4 charges it. */
  fee_ghs: number;
  extra_days: number;
  note: string | null;
  sort_order: number;
}

const COLUMNS = "id, name, kind, fee_ghs, extra_days, note, sort_order";

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listActiveDeliveryZones(): Promise<DeliveryZoneRow[]> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("delivery_zones")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    throw new Error(`Failed to load delivery zones: ${error.message}`);
  }

  return (data ?? []).map(normalizeRow);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeRow(row: Record<string, unknown>): DeliveryZoneRow {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as DeliveryZoneKind,
    fee_ghs: Number(row.fee_ghs),
    extra_days: Number(row.extra_days),
    note: row.note != null ? String(row.note) : null,
    sort_order: Number(row.sort_order),
  };
}
