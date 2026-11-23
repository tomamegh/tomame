import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** `order_firm_dates` (124): each firm door date given for an order. No logic here. */

export type FirmDateReason = "store_tracking" | "departure_moved" | "departure_cancelled";

export interface FirmDateRow {
  order_id: string;
  delivery_on: string;
  flight_on: string;
  basis: "flown" | "hub_arrival" | "expected_hub_arrival";
  reason: FirmDateReason;
}

/** The latest firm date per order. */
export async function latestFirmDates(orderIds: readonly string[]): Promise<Map<string, FirmDateRow>> {
  const ids = [...new Set(orderIds)];
  const out = new Map<string, FirmDateRow>();
  if (ids.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("order_firm_dates")
    .select("order_id, delivery_on, flight_on, basis, reason")
    .in("order_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load firm dates: ${error.message}`);
  for (const row of (data ?? []) as FirmDateRow[]) if (!out.has(row.order_id)) out.set(row.order_id, row);
  return out;
}

export async function insertFirmDates(rows: readonly FirmDateRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from("order_firm_dates").insert(rows);
  if (error) throw new Error(`Failed to record firm dates: ${error.message}`);
}

export interface AwaitingDeliveryOrder {
  id: string;
  user_id: string;
  order_no: string;
  product_name: string;
  status: string;
}

/** Orders a flight change can re-date: bought and not yet delivered. */
export async function listOrdersAwaitingDelivery(): Promise<AwaitingDeliveryOrder[]> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("id, user_id, order_no, product_name, status")
    .in("status", ["processing", "in_transit"])
    .limit(2000);
  if (error) throw new Error(`Failed to load orders awaiting delivery: ${error.message}`);
  return (data ?? []) as AwaitingDeliveryOrder[];
}
