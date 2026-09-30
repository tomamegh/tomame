import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CourierProvider } from "@/features/order-delivery/schema";
import type { OrderCourier } from "@/features/order-delivery/types";

/**
 * Data access for the courier columns on `order_deliveries` (migration 075).
 *
 * No business logic and no auth checks: the service decides who may dispatch
 * and whose courier may be read. Service role throughout — the admin writes
 * would otherwise depend on 017's `profiles.role` policies, which are a looser
 * signal than the JWT claim the service checks, and the customer reads filter
 * on `user_id` explicitly (the caller passes the signed-in viewer's id).
 */

export interface CourierOrderRow {
  id: string;
  order_no: string;
  user_id: string;
  status: string;
  product_name: string;
  quantity: number;
  order_group_id: string | null;
}

interface CourierColumns {
  order_id: string;
  courier_name: string | null;
  courier_phone: string | null;
  courier_tracking_url: string | null;
  courier_provider: CourierProvider | null;
  courier_dispatched_at: string | null;
  courier_dispatched_by: string | null;
  courier_last_notified_at: string | null;
}

const COURIER_SELECT =
  "order_id, courier_name, courier_phone, courier_tracking_url, courier_provider, courier_dispatched_at, courier_dispatched_by, courier_last_notified_at";

/** Null when no rider has been dispatched, even if the delivery row exists. */
export function toOrderCourier(row: CourierColumns | null | undefined): OrderCourier | null {
  if (!row?.courier_dispatched_at) return null;
  return {
    orderId: row.order_id,
    name: row.courier_name,
    phone: row.courier_phone,
    trackingUrl: row.courier_tracking_url,
    provider: row.courier_provider,
    dispatchedAt: row.courier_dispatched_at,
    dispatchedBy: row.courier_dispatched_by,
    lastNotifiedAt: row.courier_last_notified_at,
  };
}

export async function getCourierOrder(orderId: string): Promise<CourierOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("id, order_no, user_id, status, product_name, quantity, order_group_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the order: ${error.message}`);
  return (data as CourierOrderRow | null) ?? null;
}

export async function getOrderCourier(orderId: string): Promise<OrderCourier | null> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select(COURIER_SELECT)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the courier: ${error.message}`);
  return toOrderCourier(data as CourierColumns | null);
}

/** The viewer's own order only: a row for someone else's order reads as none. */
export async function getOwnedOrderCourier(
  userId: string,
  orderId: string,
): Promise<OrderCourier | null> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select(COURIER_SELECT)
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the courier: ${error.message}`);
  return toOrderCourier(data as CourierColumns | null);
}

/** One read for a list of the viewer's orders — the home screen's batch. */
export async function listOwnedOrderCouriers(
  userId: string,
  orderIds: readonly string[],
): Promise<Map<string, OrderCourier>> {
  const out = new Map<string, OrderCourier>();
  if (orderIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select(COURIER_SELECT)
    .eq("user_id", userId)
    .in("order_id", [...orderIds])
    .not("courier_dispatched_at", "is", null);
  if (error) throw new Error(`Failed to load couriers: ${error.message}`);
  for (const row of (data ?? []) as CourierColumns[]) {
    const courier = toOrderCourier(row);
    if (courier) out.set(courier.orderId, courier);
  }
  return out;
}

export interface CourierWrite {
  orderId: string;
  userId: string;
  name: string | null;
  phone: string | null;
  trackingUrl: string | null;
  provider: CourierProvider | null;
  dispatchedAt: string;
  dispatchedBy: string;
}

/**
 * Upsert on `order_id` (unique since 050): an order that shipped before 050 may
 * have no delivery row at all, and the hand-off is a natural moment to make one.
 * `status` moves to 017's `out_for_delivery`, which is what this is.
 */
export async function upsertOrderCourier(input: CourierWrite): Promise<OrderCourier> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .upsert(
      {
        order_id: input.orderId,
        user_id: input.userId,
        status: "out_for_delivery",
        courier_name: input.name,
        courier_phone: input.phone,
        courier_tracking_url: input.trackingUrl,
        courier_provider: input.provider,
        courier_dispatched_at: input.dispatchedAt,
        courier_dispatched_by: input.dispatchedBy,
      },
      { onConflict: "order_id" },
    )
    .select(COURIER_SELECT)
    .single();
  if (error || !data) throw new Error(`Failed to save the courier: ${error?.message ?? "no row"}`);
  return toOrderCourier(data as CourierColumns)!;
}

export async function stampCourierNotified(orderId: string, at: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("order_deliveries")
    .update({ courier_last_notified_at: at })
    .eq("order_id", orderId);
  if (error) throw new Error(`Failed to stamp the courier notification: ${error.message}`);
}

export async function getProfileDisplayName(userId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { first_name: string | null; last_name: string | null } | null;
  const name = [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}
