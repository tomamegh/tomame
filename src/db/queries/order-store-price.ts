import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `orders.store_paid_*` (migration 103): the item price the store charged,
 * recorded when staff mark an order purchased. Service role; who may write it
 * and the audit row live in `order-purchase.service.ts`.
 */
export async function recordStorePaidPrice(input: { orderId: string; price: number; currency: string; by: string }): Promise<void> {
  const { error } = await createAdminClient()
    .from("orders")
    .update({
      store_paid_price: input.price,
      store_paid_currency: input.currency,
      store_paid_at: new Date().toISOString(),
      store_paid_by: input.by,
    })
    .eq("id", input.orderId);
  if (error) throw new Error(`Failed to record the store price: ${error.message}`);
}
