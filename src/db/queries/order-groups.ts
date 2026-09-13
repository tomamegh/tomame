import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Row types (mirror migration 048 `order_groups`) ─────────────────────────

export type OrderGroupStatus = "pending" | "paid" | "cancelled";

export interface OrderGroupRow {
  id: string;
  user_id: string;
  payment_id: string | null;
  delivery_address_id: string | null;
  delivery_zone_id: string | null;
  /** Snapshot of the address (or `{kind:'pickup', …}`) at checkout; never re-read from the address book. */
  delivery_address: Record<string, unknown> | null;
  item_count: number;
  subtotal_usd: number;
  tax_usd: number;
  fee_usd: number;
  freight_ghs: number;
  consolidation_saving_ghs: number;
  delivery_fee_ghs: number;
  total_ghs: number;
  /** What Paystack is asked for: `round(total_ghs × 100)`. */
  total_pesewas: number;
  status: OrderGroupStatus;
  created_at: string;
  updated_at: string;
}

export type OrderGroupInsert = Omit<OrderGroupRow, "id" | "payment_id" | "created_at" | "updated_at">;

/** The money columns checkout may correct once the orders exist (see checkout.service.ts). */
export type OrderGroupMoneyPatch = Partial<
  Pick<OrderGroupRow, "subtotal_usd" | "tax_usd" | "fee_usd" | "freight_ghs" | "total_ghs" | "total_pesewas">
>;

const COLUMNS =
  "id, user_id, payment_id, delivery_address_id, delivery_zone_id, delivery_address, item_count, subtotal_usd, tax_usd, fee_usd, freight_ghs, consolidation_saving_ghs, delivery_fee_ghs, total_ghs, total_pesewas, status, created_at, updated_at";

// ── Queries (service role — every write is the server's) ────────────────────

export async function insertOrderGroup(input: OrderGroupInsert): Promise<OrderGroupRow> {
  const client = createAdminClient();
  const { data, error } = await client.from("order_groups").insert(input).select(COLUMNS).single();
  if (error) throw new Error(`Failed to create order group: ${error.message}`);
  return normalizeRow(data);
}

export async function getOrderGroupById(id: string): Promise<OrderGroupRow | null> {
  const client = createAdminClient();
  const { data, error } = await client.from("order_groups").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load order group: ${error.message}`);
  return data ? normalizeRow(data) : null;
}

/**
 * Guarded transition: only a row still in `from` moves. Returns whether one did,
 * so the callback/webhook race settles a group exactly once.
 */
export async function updateOrderGroupStatus(
  id: string,
  from: OrderGroupStatus,
  to: OrderGroupStatus,
  patch: Partial<Pick<OrderGroupRow, "payment_id">> = {},
): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("order_groups")
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) throw new Error(`Failed to update order group: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Correct a PENDING group's money from its orders. Never touches a paid group. */
export async function updateOrderGroupTotals(id: string, patch: OrderGroupMoneyPatch): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("order_groups")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`Failed to update order group totals: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** The user's newest unpaid group — what a repeated checkout POST returns once the cart has flipped. */
export async function findLatestPendingGroupForUser(userId: string): Promise<OrderGroupRow | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("order_groups")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load order group: ${error.message}`);
  return data ? normalizeRow(data) : null;
}

// ── Row normalisation (PostgREST returns NUMERIC as strings) ────────────────

function normalizeRow(row: Record<string, unknown>): OrderGroupRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    payment_id: (row.payment_id as string | null) ?? null,
    delivery_address_id: (row.delivery_address_id as string | null) ?? null,
    delivery_zone_id: (row.delivery_zone_id as string | null) ?? null,
    delivery_address: (row.delivery_address as Record<string, unknown> | null) ?? null,
    item_count: Number(row.item_count),
    subtotal_usd: Number(row.subtotal_usd),
    tax_usd: Number(row.tax_usd),
    fee_usd: Number(row.fee_usd),
    freight_ghs: Number(row.freight_ghs),
    consolidation_saving_ghs: Number(row.consolidation_saving_ghs),
    delivery_fee_ghs: Number(row.delivery_fee_ghs),
    total_ghs: Number(row.total_ghs),
    total_pesewas: Number(row.total_pesewas),
    status: row.status as OrderGroupStatus,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
