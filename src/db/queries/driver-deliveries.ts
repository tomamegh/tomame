import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Drivers, their assigned deliveries and the customer's delivery code (102).
 * Service role throughout; `features/drivers` decides who may read what, and
 * the code itself never leaves the server except to the order's owner.
 */

export interface DriverProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export interface DeliveryRow {
  order_id: string;
  user_id: string;
  driver_id: string | null;
  driver_assigned_at: string | null;
  delivery_code: string | null;
  delivery_code_failures: number;
}

const DELIVERY_COLUMNS = "order_id, user_id, driver_id, driver_assigned_at, delivery_code, delivery_code_failures";

export async function listDriverProfiles(): Promise<DriverProfileRow[]> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, first_name, last_name, phone")
    .eq("role", "driver")
    .order("first_name", { ascending: true });
  if (error) throw new Error(`Failed to load drivers: ${error.message}`);
  return (data ?? []) as DriverProfileRow[];
}

export async function getDriverProfile(id: string): Promise<DriverProfileRow | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, first_name, last_name, phone")
    .eq("id", id)
    .eq("role", "driver")
    .maybeSingle();
  if (error) throw new Error(`Failed to load the driver: ${error.message}`);
  return (data as DriverProfileRow | null) ?? null;
}

export async function listDeliveryRows(orderIds: string[]): Promise<DeliveryRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select(DELIVERY_COLUMNS)
    .in("order_id", orderIds);
  if (error) throw new Error(`Failed to load deliveries: ${error.message}`);
  return (data ?? []) as DeliveryRow[];
}

/** Rows assigned to one driver, or to any driver when `driverId` is null. */
export async function listAssignedDeliveryRows(driverId: string | null, limit = 300): Promise<DeliveryRow[]> {
  let query = createAdminClient().from("order_deliveries").select(DELIVERY_COLUMNS);
  query = driverId ? query.eq("driver_id", driverId) : query.not("driver_id", "is", null);
  const { data, error } = await query.order("driver_assigned_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`Failed to load assigned deliveries: ${error.message}`);
  return (data ?? []) as DeliveryRow[];
}

export async function assignDriver(orderId: string, userId: string, driverId: string, at: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("order_deliveries")
    .upsert({ order_id: orderId, user_id: userId, driver_id: driverId, driver_assigned_at: at }, { onConflict: "order_id" });
  if (error) throw new Error(`Failed to assign the driver: ${error.message}`);
}

/** A code this customer already holds for a parcel still on its way, to reuse. */
export async function findOpenCustomerCode(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select("delivery_code, orders!inner(status)")
    .eq("user_id", userId)
    .eq("orders.status", "in_transit")
    .not("delivery_code", "is", null)
    .limit(1);
  if (error) throw new Error(`Failed to look up the customer's code: ${error.message}`);
  const row = (data ?? [])[0] as { delivery_code: string | null } | undefined;
  return row?.delivery_code ?? null;
}

export async function setDeliveryCode(orderId: string, userId: string, code: string, at: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("order_deliveries")
    .upsert(
      { order_id: orderId, user_id: userId, delivery_code: code, delivery_code_issued_at: at, delivery_code_failures: 0 },
      { onConflict: "order_id" },
    );
  if (error) throw new Error(`Failed to save the delivery code: ${error.message}`);
}

export async function setCodeFailures(orderId: string, failures: number): Promise<void> {
  const { error } = await createAdminClient()
    .from("order_deliveries")
    .update({ delivery_code_failures: failures })
    .eq("order_id", orderId);
  if (error) throw new Error(`Failed to record the attempt: ${error.message}`);
}

export async function markDeliveredBy(orderIds: string[], by: string, withCode: boolean): Promise<void> {
  if (orderIds.length === 0) return;
  const { error } = await createAdminClient()
    .from("order_deliveries")
    .update({ delivered_by: by, delivered_with_code: withCode })
    .in("order_id", orderIds);
  if (error) throw new Error(`Failed to record who delivered: ${error.message}`);
}

/** Orders a driver has delivered since a moment, for their "done today". */
export async function listDeliveredBy(driverId: string, since: string): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select("order_id")
    .eq("delivered_by", driverId)
    .gte("delivered_at", since);
  if (error) throw new Error(`Failed to load delivered orders: ${error.message}`);
  return (data ?? []).map((r) => r.order_id as string);
}

/** How many delivery photos each order has had since a moment. */
export async function countDeliveryPhotosSince(orderIds: string[], since: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("order_photos")
    .select("order_id")
    .eq("kind", "delivered")
    .in("order_id", orderIds)
    .gte("created_at", since);
  if (error) throw new Error(`Failed to load delivery photos: ${error.message}`);
  for (const row of data ?? []) out.set(row.order_id as string, (out.get(row.order_id as string) ?? 0) + 1);
  return out;
}

/** The order owner's own code. Null for anyone else's order. */
export async function getViewerDeliveryCode(viewerId: string, orderId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("order_deliveries")
    .select("delivery_code")
    .eq("order_id", orderId)
    .eq("user_id", viewerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the delivery code: ${error.message}`);
  return (data?.delivery_code as string | null) ?? null;
}
