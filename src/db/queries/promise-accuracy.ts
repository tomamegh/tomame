import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PromiseAccuracyRow } from "@/features/deliveries/promise-accuracy";

/**
 * Delivered orders since `since`, with the promises they were given: the
 * estimate at payment (123) and every firm date (124), oldest first. No logic here.
 */
export async function listDeliveredPromises(since: Date): Promise<PromiseAccuracyRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select("id, order_no, delivered_at, promised_to")
    .in("status", ["delivered", "completed"])
    .gte("delivered_at", since.toISOString())
    .order("delivered_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Failed to load delivered orders: ${error.message}`);
  const orders = (data ?? []) as Array<{ id: string; order_no: string; delivered_at: string | null; promised_to: string | null }>;

  const firm = new Map<string, string[]>();
  const ids = orders.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data: rows, error: firmError } = await db
      .from("order_firm_dates")
      .select("order_id, delivery_on")
      .in("order_id", ids.slice(i, i + 100))
      .order("created_at", { ascending: true });
    if (firmError) throw new Error(`Failed to load firm dates: ${firmError.message}`);
    for (const row of (rows ?? []) as Array<{ order_id: string; delivery_on: string }>) {
      firm.set(row.order_id, [...(firm.get(row.order_id) ?? []), row.delivery_on]);
    }
  }

  return orders
    .filter((o) => o.delivered_at)
    .map((o) => ({
      orderId: o.id,
      orderNo: o.order_no,
      deliveredOn: o.delivered_at!.slice(0, 10),
      estimateTo: o.promised_to,
      firmDates: firm.get(o.id) ?? [],
    }));
}
