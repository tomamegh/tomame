import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, OrderPricingBreakdown, OrderStatus } from "@/features/orders/types";

/**
 * Order reads for screens that need a few columns, not the whole row.
 *
 * `db/queries/**` is data access only: no business logic, no auth checks. The
 * client is passed in so the caller decides which one applies — the Home screen
 * hands in the cookie-bound client and RLS scopes the rows.
 */

/** Exactly the columns the Home "Journeys in motion" list renders. */
export interface RecentOrderRow {
  id: string;
  product_name: string;
  product_url: string;
  status: OrderStatus;
  pricing: OrderPricingBreakdown | null;
  /** A single admin-entered DATE, written only on the `in_transit` transition. */
  estimated_delivery_date: string | null;
  created_at: string;
}

const RECENT_COLUMNS =
  "id, product_name, product_url, status, pricing, estimated_delivery_date, created_at";

/**
 * Statuses a parcel is counted as "moving" in. Kept next to the query that uses
 * it; the display-side vocabulary lives in
 * `src/features/orders/services/journey-stage.ts`.
 */
export const MOVING_ORDER_STATUSES: readonly OrderStatus[] = [
  "paid",
  "processing",
  "in_transit",
];

/** Newest orders first, capped — the Home list shows a handful, not the archive. */
export async function getRecentOrdersForUser(
  client: SupabaseClient,
  userId: string,
  limit: number,
): Promise<RecentOrderRow[]> {
  const { data, error } = await client
    .from("orders")
    .select(RECENT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load recent orders: ${error.message}`);
  }

  return (data ?? []) as unknown as RecentOrderRow[];
}

/**
 * How many parcels are in motion. Counted in the database (`head: true`), never
 * by fetching rows and measuring the array.
 */
export async function countMovingOrders(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await client
    .from("orders")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .in("status", [...MOVING_ORDER_STATUSES]);

  if (error) {
    throw new Error(`Failed to count moving orders: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Just enough of an order to answer "may this person see it?".
 *
 * Exists so `order-events.service.ts` can establish ownership WITHOUT importing
 * `orders.service.ts`, which imports it back — a module cycle that resolves to
 * `undefined` at the wrong moment under Turbopack. Two columns, no join.
 */
export async function getOrderOwner(
  client: SupabaseClient,
  orderId: string,
): Promise<{ id: string; user_id: string } | null> {
  const { data, error } = await client
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load order: ${error.message}`);
  }

  return data ? { id: String(data.id), user_id: String(data.user_id) } : null;
}

/** Every order one payment buys, in checkout order. Admin client — the payment webhook has no cookie. */
export async function listOrdersByGroup(client: SupabaseClient, groupId: string): Promise<Order[]> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("order_group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load the group's orders: ${error.message}`);
  }

  return (data ?? []) as Order[];
}
