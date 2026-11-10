import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CourierProvider } from "@/features/order-delivery/schema";

/**
 * The customer's own ride (migration 101): columns on `order_deliveries`.
 * Service role throughout; the service decides who may read or write whose.
 */

export interface RideRequestRow {
  order_id: string;
  user_id: string;
  ride_requested_at: string | null;
  ride_rider_name: string | null;
  ride_rider_phone: string | null;
  ride_tracking_url: string | null;
  ride_provider: CourierProvider | null;
  ride_eta: string | null;
  ride_note: string | null;
  courier_dispatched_at: string | null;
  courier_arranged_by: "tomame" | "customer";
}

const COLUMNS =
  "order_id, user_id, ride_requested_at, ride_rider_name, ride_rider_phone, ride_tracking_url, ride_provider, ride_eta, ride_note, courier_dispatched_at, courier_arranged_by";

export async function getRideRequest(orderId: string): Promise<RideRequestRow | null> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select(COLUMNS)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the ride request: ${error.message}`);
  return (data as RideRequestRow | null) ?? null;
}

export interface RideRequestWrite {
  requestedAt: string;
  riderName: string | null;
  riderPhone: string | null;
  trackingUrl: string | null;
  provider: CourierProvider | null;
  eta: string | null;
  note: string | null;
}

/** Save (or with null, take down) the request. Upserts: an older order may have no delivery row. */
export async function saveRideRequest(
  orderId: string,
  userId: string,
  ride: RideRequestWrite | null,
): Promise<RideRequestRow> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .upsert(
      {
        order_id: orderId,
        user_id: userId,
        ride_requested_at: ride?.requestedAt ?? null,
        ride_rider_name: ride?.riderName ?? null,
        ride_rider_phone: ride?.riderPhone ?? null,
        ride_tracking_url: ride?.trackingUrl ?? null,
        ride_provider: ride?.provider ?? null,
        ride_eta: ride?.eta ?? null,
        ride_note: ride?.note ?? null,
      },
      { onConflict: "order_id" },
    )
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(`Failed to save the ride request: ${error?.message ?? "no row"}`);
  return data as RideRequestRow;
}

/** Requests the warehouse has not handed over yet, oldest first. */
export async function listOpenRideRequests(limit = 100): Promise<RideRequestRow[]> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select(COLUMNS)
    .not("ride_requested_at", "is", null)
    .is("courier_dispatched_at", null)
    .order("ride_requested_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load ride requests: ${error.message}`);
  return (data ?? []) as RideRequestRow[];
}

export interface RideOrderRow {
  id: string;
  user_id: string;
  status: string;
  held_at: string | null;
  order_group_id: string | null;
}

export async function getRideOrder(orderId: string): Promise<RideOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("id, user_id, status, held_at, order_group_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the order: ${error.message}`);
  return (data as RideOrderRow | null) ?? null;
}

/** `site_settings.ghana_warehouse_address`, raw. */
export async function getGhanaWarehouseAddress(): Promise<Record<string, unknown> | null> {
  const { data, error } = await createAdminClient()
    .from("site_settings")
    .select("value")
    .eq("key", "ghana_warehouse_address")
    .maybeSingle();
  if (error) return null;
  const value = data?.value;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
