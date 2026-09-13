import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `order_events` access — the customer-readable journey log (migration 050).
 *
 * `db/queries/**` is data access only: no business logic, no auth checks. Reads
 * take the client so the caller decides whose eyes they are (the cookie-bound
 * client lets RLS scope the rows); the single write is service-role by
 * definition, because no customer may write their own parcel's history.
 */

// ── Row types (mirror migration 050 `order_events`) ─────────────────────────

/**
 * The vocabulary of the log. Deliberately a union rather than `string`: a typo in
 * a writer should fail typecheck, not the CHECK constraint at runtime in the
 * middle of a status transition.
 */
export type OrderEventKind =
  | "payment_received"
  | "purchased"
  | "hub_received"
  | "departed"
  | "arrived_country"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled"
  | "note";

export interface OrderEventRow {
  id: string;
  order_id: string;
  order_group_id: string | null;
  kind: OrderEventKind;
  title: string;
  detail: string | null;
  location: string | null;
  weight_lbs: number | null;
  /** When it HAPPENED — not when the row was written. See 050. */
  occurred_at: string;
  is_customer_visible: boolean;
  created_by: string | null;
  created_at: string;
}

export interface OrderEventInsert {
  order_id: string;
  order_group_id?: string | null;
  kind: OrderEventKind;
  title: string;
  detail?: string | null;
  location?: string | null;
  weight_lbs?: number | null;
  occurred_at?: string;
  is_customer_visible?: boolean;
  created_by?: string | null;
}

const COLUMNS =
  "id, order_id, order_group_id, kind, title, detail, location, weight_lbs, occurred_at, is_customer_visible, created_by, created_at";

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * One order's events, newest first — the order the Updates timeline draws them
 * in (`v2-detail`, design line 351).
 *
 * `customerVisibleOnly` is applied in SQL as well as by RLS. Belt and braces on
 * purpose: an admin client bypasses RLS entirely, and this same function backs
 * the customer's detail screen through the service role when a route has already
 * established ownership.
 */
export async function listOrderEvents(
  client: SupabaseClient,
  orderId: string,
  options: { customerVisibleOnly?: boolean } = {},
): Promise<OrderEventRow[]> {
  let query = client
    .from("order_events")
    .select(COLUMNS)
    .eq("order_id", orderId)
    .order("occurred_at", { ascending: false });

  if (options.customerVisibleOnly) {
    query = query.eq("is_customer_visible", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load order events: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(normalizeRow);
}

/**
 * Events for many orders at once — one round trip for a whole list screen.
 *
 * The Journeys list needs to know, per row, whether a parcel has reached the US
 * hub; doing that with one query per order would be N+1 over a list that grows
 * with the customer's history.
 */
export async function listOrderEventsForOrders(
  client: SupabaseClient,
  orderIds: readonly string[],
  options: { customerVisibleOnly?: boolean } = {},
): Promise<OrderEventRow[]> {
  if (orderIds.length === 0) return [];

  let query = client
    .from("order_events")
    .select(COLUMNS)
    .in("order_id", [...orderIds])
    .order("occurred_at", { ascending: false });

  if (options.customerVisibleOnly) {
    query = query.eq("is_customer_visible", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load order events: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(normalizeRow);
}

/** Write one event. Service-role client only — RLS grants `authenticated` no INSERT. */
export async function insertOrderEvent(
  client: SupabaseClient,
  input: OrderEventInsert,
): Promise<OrderEventRow> {
  const { data, error } = await client
    .from("order_events")
    .insert(input)
    .select(COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to record order event: ${error.message}`);
  }

  return normalizeRow(data as Record<string, unknown>);
}

// ── Row normalisation (PostgREST returns NUMERIC as strings) ────────────────

function normalizeRow(row: Record<string, unknown>): OrderEventRow {
  const weight = row.weight_lbs;
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    order_group_id: (row.order_group_id as string | null) ?? null,
    kind: row.kind as OrderEventKind,
    title: String(row.title),
    detail: (row.detail as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    weight_lbs: weight == null ? null : Number(weight),
    occurred_at: String(row.occurred_at),
    is_customer_visible: row.is_customer_visible === true,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
  };
}
