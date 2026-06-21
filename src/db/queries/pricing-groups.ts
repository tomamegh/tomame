import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Row types ───────────────────────────────────────────────────────────────

export interface PricingGroupRow {
  id: string;
  slug: string;
  name: string;
  flat_rate_ghs: number | null;
  flat_rate_expression: string | null;
  value_percentage: number;
  value_percentage_high: number | null;
  value_threshold_usd: number | null;
  default_weight_lbs: number | null;
  requires_weight: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface CategoryMappingRow {
  tomame_category: string;
  pricing_group: PricingGroupRow;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch all active pricing groups.
 */
export async function getAllPricingGroups(): Promise<PricingGroupRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("pricing_groups")
    .select(
      "id, slug, name, flat_rate_ghs, flat_rate_expression, value_percentage, value_percentage_high, value_threshold_usd, default_weight_lbs, requires_weight, is_active, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    throw new Error(`Failed to load pricing groups: ${error.message}`);
  }

  return (data ?? []).map(normalizeRow);
}

/**
 * Fetch the full category → pricing group map.
 * Returns a Map keyed by tomame_category string.
 */
export async function getCategoryPricingMap(): Promise<
  Map<string, PricingGroupRow>
> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("category_pricing_map")
    .select(
      `
      tomame_category,
      pricing_groups!inner (
        id, slug, name, flat_rate_ghs, flat_rate_expression,
        value_percentage, value_percentage_high, value_threshold_usd,
        default_weight_lbs, requires_weight, is_active, sort_order
      )
    `,
    );

  if (error) {
    throw new Error(`Failed to load category pricing map: ${error.message}`);
  }

  const map = new Map<string, PricingGroupRow>();
  for (const row of data ?? []) {
    const pg = row.pricing_groups as unknown as Record<string, unknown>;
    if (!pg) continue;
    map.set(row.tomame_category, normalizeRow(pg));
  }
  return map;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeRow(row: Record<string, unknown>): PricingGroupRow {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    flat_rate_ghs: row.flat_rate_ghs != null ? Number(row.flat_rate_ghs) : null,
    flat_rate_expression:
      row.flat_rate_expression != null
        ? String(row.flat_rate_expression)
        : null,
    value_percentage: Number(row.value_percentage),
    value_percentage_high:
      row.value_percentage_high != null
        ? Number(row.value_percentage_high)
        : null,
    value_threshold_usd:
      row.value_threshold_usd != null
        ? Number(row.value_threshold_usd)
        : null,
    default_weight_lbs:
      row.default_weight_lbs != null ? Number(row.default_weight_lbs) : null,
    requires_weight: Boolean(row.requires_weight),
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order),
  };
}
