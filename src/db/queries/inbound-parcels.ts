import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for inbound parcels (086): the store's tracking number and the
 * Tomame orders it belongs to.
 *
 * Service role throughout: neither table has an `anon` or `authenticated`
 * grant. Who may read or write is decided by `inbound.service.ts`; nothing here
 * checks a role or a state.
 */

export type InboundStatus = "expected" | "arrived" | "unmatched";
export type InboundSource = "registered" | "scanned";

export interface InboundParcelRow {
  id: string;
  tracking_number: string;
  tracking_key: string;
  carrier: string | null;
  status: InboundStatus;
  source: InboundSource;
  store_order_ref: string | null;
  note: string | null;
  registered_by: string | null;
  arrived_at: string | null;
  arrived_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundLinkRow {
  parcel_id: string;
  order_id: string;
  linked_by: string | null;
  created_at: string;
}

const COLUMNS =
  "id, tracking_number, tracking_key, carrier, status, source, store_order_ref, note, registered_by, arrived_at, arrived_by, created_at, updated_at";
const LINK_COLUMNS = "parcel_id, order_id, linked_by, created_at";

export async function getInboundParcel(id: string): Promise<InboundParcelRow | null> {
  const { data, error } = await createAdminClient()
    .from("inbound_parcels")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the parcel: ${error.message}`);
  return (data as InboundParcelRow | null) ?? null;
}

/** The parcel any of these keys names. Keys are unique, so at most one per key. */
export async function findInboundParcelByKeys(keys: string[]): Promise<InboundParcelRow | null> {
  if (keys.length === 0) return null;
  const { data, error } = await createAdminClient()
    .from("inbound_parcels")
    .select(COLUMNS)
    .in("tracking_key", keys)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed to look up the parcel: ${error.message}`);
  return ((data ?? [])[0] as InboundParcelRow | undefined) ?? null;
}

export async function listInboundParcels(filters: {
  statuses?: InboundStatus[];
  ids?: string[];
  limit?: number;
  oldestFirst?: boolean;
}): Promise<InboundParcelRow[]> {
  if (filters.ids && filters.ids.length === 0) return [];
  let query = createAdminClient().from("inbound_parcels").select(COLUMNS);
  if (filters.statuses?.length) query = query.in("status", filters.statuses);
  if (filters.ids) query = query.in("id", filters.ids);
  const { data, error } = await query
    .order(filters.oldestFirst ? "created_at" : "updated_at", { ascending: !!filters.oldestFirst })
    .limit(filters.limit ?? 200);
  if (error) throw new Error(`Failed to load parcels: ${error.message}`);
  return (data ?? []) as InboundParcelRow[];
}

export async function countInboundByStatus(): Promise<Record<InboundStatus, number>> {
  const db = createAdminClient();
  const statuses: InboundStatus[] = ["expected", "arrived", "unmatched"];
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await db
        .from("inbound_parcels")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw new Error(`Failed to count parcels: ${error.message}`);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<InboundStatus, number>;
}

/**
 * Insert a parcel. The unique key is the guard against two operators
 * registering one number at once: a clash comes back as `conflict`.
 */
export async function insertInboundParcel(row: {
  tracking_number: string;
  tracking_key: string;
  carrier: string | null;
  status: InboundStatus;
  source: InboundSource;
  store_order_ref?: string | null;
  note?: string | null;
  registered_by: string;
  arrived_at?: string | null;
  arrived_by?: string | null;
}): Promise<{ row: InboundParcelRow | null; conflict: boolean }> {
  const { data, error } = await createAdminClient()
    .from("inbound_parcels")
    .insert(row)
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return { row: null, conflict: true };
    throw new Error(`Failed to save the parcel: ${error.message}`);
  }
  return { row: data as InboundParcelRow, conflict: false };
}

export type InboundPatch = Partial<
  Pick<InboundParcelRow, "status" | "arrived_at" | "arrived_by" | "note" | "store_order_ref">
>;

/** Guarded on the status the caller saw; null means someone else moved it first. */
export async function updateInboundParcel(
  id: string,
  expected: InboundStatus | InboundStatus[],
  patch: InboundPatch,
): Promise<InboundParcelRow | null> {
  const statuses = Array.isArray(expected) ? expected : [expected];
  const { data, error } = await createAdminClient()
    .from("inbound_parcels")
    .update(patch)
    .eq("id", id)
    .in("status", statuses)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update the parcel: ${error.message}`);
  return (data as InboundParcelRow | null) ?? null;
}

/** Only a parcel that never arrived is deleted, when its last order is unlinked. */
export async function deleteExpectedInboundParcel(id: string): Promise<InboundParcelRow | null> {
  const { data, error } = await createAdminClient()
    .from("inbound_parcels")
    .delete()
    .eq("id", id)
    .eq("status", "expected")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to remove the parcel: ${error.message}`);
  return (data as InboundParcelRow | null) ?? null;
}

// ── Links ───────────────────────────────────────────────────────────────────

export async function listInboundLinks(filter: {
  parcelIds?: string[];
  orderIds?: string[];
}): Promise<InboundLinkRow[]> {
  if (filter.parcelIds && filter.parcelIds.length === 0) return [];
  if (filter.orderIds && filter.orderIds.length === 0) return [];
  let query = createAdminClient().from("inbound_parcel_orders").select(LINK_COLUMNS);
  if (filter.parcelIds) query = query.in("parcel_id", filter.parcelIds);
  if (filter.orderIds) query = query.in("order_id", filter.orderIds);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load parcel links: ${error.message}`);
  return (data ?? []) as InboundLinkRow[];
}

/** Idempotent: linking an order that is already linked is not an error. */
export async function insertInboundLink(row: {
  parcel_id: string;
  order_id: string;
  linked_by: string;
}): Promise<{ created: boolean }> {
  const { data, error } = await createAdminClient()
    .from("inbound_parcel_orders")
    .upsert(row, { onConflict: "parcel_id,order_id", ignoreDuplicates: true })
    .select("parcel_id");
  if (error) throw new Error(`Failed to link the parcel: ${error.message}`);
  return { created: (data ?? []).length > 0 };
}

export async function deleteInboundLink(parcelId: string, orderId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("inbound_parcel_orders")
    .delete()
    .eq("parcel_id", parcelId)
    .eq("order_id", orderId)
    .select("parcel_id");
  if (error) throw new Error(`Failed to unlink the parcel: ${error.message}`);
  return (data ?? []).length > 0;
}
