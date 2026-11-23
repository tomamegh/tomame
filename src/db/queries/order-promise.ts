import type { SupabaseClient } from "@supabase/supabase-js";

/** 123. The window promised at payment. */
export interface OrderPromiseRow {
  promised_from: string;
  promised_to: string;
  promised_at: string;
}

/** Writes the payment-time promise once: an order that already has one is left alone (null back). */
export async function stampOrderPromise(
  client: SupabaseClient,
  orderId: string,
  window: { from: string; to: string },
  at: Date,
): Promise<OrderPromiseRow | null> {
  const { data, error } = await client
    .from("orders")
    .update({ promised_from: window.from, promised_to: window.to, promised_at: at.toISOString() })
    .eq("id", orderId)
    .is("promised_at", null)
    .select("promised_from, promised_to, promised_at")
    .maybeSingle();
  if (error) throw new Error(`stampOrderPromise failed: ${error.message}`);
  return (data as OrderPromiseRow | null) ?? null;
}
