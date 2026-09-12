import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

// ── Row types ───────────────────────────────────────────────────────────────

export type RegionStatus = "live" | "soon" | "off";

/** `regions.code` matches ORIGIN_COUNTRIES (`src/config/constants.ts`): USA | UK | CHINA. */
export interface RegionRow {
  code: string;
  name: string;
  status: RegionStatus;
  hub_city: string | null;
  transit_days_min: number | null;
  transit_days_max: number | null;
  store_names: string[];
  tag_names: string[];
  blurb: string | null;
  photo_key: string | null;
  sort_order: number;
}

const COLUMNS =
  "code, name, status, hub_city, transit_days_min, transit_days_max, store_names, tag_names, blurb, photo_key, sort_order";

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listRegions(): Promise<RegionRow[]> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("regions")
    .select(COLUMNS)
    .order("sort_order");

  if (error) {
    throw new Error(`Failed to load regions: ${error.message}`);
  }

  return (data ?? []).map(normalizeRow);
}

export async function getRegionByCode(code: string): Promise<RegionRow | null> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("regions")
    .select(COLUMNS)
    .eq("code", code)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load region ${code}: ${error.message}`);
  }

  return data ? normalizeRow(data) : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeRow(row: Record<string, unknown>): RegionRow {
  return {
    code: String(row.code),
    name: String(row.name),
    status: row.status as RegionStatus,
    hub_city: row.hub_city != null ? String(row.hub_city) : null,
    transit_days_min:
      row.transit_days_min != null ? Number(row.transit_days_min) : null,
    transit_days_max:
      row.transit_days_max != null ? Number(row.transit_days_max) : null,
    store_names: toStringArray(row.store_names),
    tag_names: toStringArray(row.tag_names),
    blurb: row.blurb != null ? String(row.blurb) : null,
    photo_key: row.photo_key != null ? String(row.photo_key) : null,
    sort_order: Number(row.sort_order),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}
