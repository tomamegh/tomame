import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface FixedFreightItemRow {
  id: string;
  category: string;
  product_name: string;
  freight_rate_ghs: number;
  keywords: string[];
  sort_order: number;
}

/** Active pre-negotiated freight items, cheapest sort first. */
export async function getActiveFixedFreightItems(): Promise<FixedFreightItemRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("fixed_freight_items")
    .select("id, category, product_name, freight_rate_ghs, keywords, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(`Failed to load fixed freight items: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    category: String(r.category),
    product_name: String(r.product_name),
    freight_rate_ghs: Number(r.freight_rate_ghs),
    keywords: Array.isArray(r.keywords) ? r.keywords.map(String) : [],
    sort_order: Number(r.sort_order),
  }));
}

// ── Admin: the whole list, and writes ────────────────────────────────────────

/** A fixed-freight row as the admin console sees it, deactivated rows included. */
export interface AdminFixedFreightItemRow extends FixedFreightItemRow {
  is_active: boolean;
  updated_at: string;
}

export interface FixedFreightItemWrite {
  category: string;
  product_name: string;
  freight_rate_ghs: number;
  keywords: string[];
  sort_order: number;
  is_active: boolean;
}

const ADMIN_COLUMNS = "id, category, product_name, freight_rate_ghs, keywords, sort_order, is_active, updated_at";

function toAdminRow(r: Record<string, unknown>): AdminFixedFreightItemRow {
  return {
    id: String(r.id),
    category: String(r.category),
    product_name: String(r.product_name),
    freight_rate_ghs: Number(r.freight_rate_ghs),
    keywords: Array.isArray(r.keywords) ? r.keywords.map(String) : [],
    sort_order: Number(r.sort_order),
    is_active: Boolean(r.is_active),
    updated_at: String(r.updated_at),
  };
}

/** Every row, active and deactivated, by shelf then sort order. */
export async function listAllFixedFreightItems(): Promise<AdminFixedFreightItemRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("fixed_freight_items")
    .select(ADMIN_COLUMNS)
    .order("category")
    .order("sort_order")
    .order("product_name");
  if (error) throw new Error(`Failed to load fixed freight items: ${error.message}`);
  return (data ?? []).map(toAdminRow);
}

export async function getFixedFreightItemById(id: string): Promise<AdminFixedFreightItemRow | null> {
  const client = createAdminClient();
  const { data, error } = await client.from("fixed_freight_items").select(ADMIN_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load fixed freight item: ${error.message}`);
  return data ? toAdminRow(data) : null;
}

export async function insertFixedFreightItem(row: FixedFreightItemWrite): Promise<AdminFixedFreightItemRow> {
  const client = createAdminClient();
  const { data, error } = await client.from("fixed_freight_items").insert(row).select(ADMIN_COLUMNS).single();
  if (error || !data) throw new Error(`Failed to create fixed freight item: ${error?.message ?? "no row"}`);
  return toAdminRow(data);
}

/**
 * Patch one row, only while it still carries `expectedUpdatedAt` (optimistic
 * concurrency: the caller read that stamp). The table has no `updated_at`
 * trigger (014), so the stamp is set here. Returns null when no row matched:
 * the id is gone or someone else changed the row since it was read.
 */
export async function updateFixedFreightItem(
  id: string,
  patch: Partial<FixedFreightItemWrite>,
  expectedUpdatedAt: string,
): Promise<AdminFixedFreightItemRow | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("fixed_freight_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(ADMIN_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update fixed freight item: ${error.message}`);
  return data ? toAdminRow(data) : null;
}
