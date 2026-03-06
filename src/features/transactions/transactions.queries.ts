import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbPayment } from "@/types/db";
import { logger } from "@/lib/logger";

export async function getAllTransactions(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string },
): Promise<DbPayment[]> {
  let query = client
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.userId) query = query.eq("user_id", filters.userId);

  const { data, error } = await query;

  if (error) {
    logger.error("getAllTransactions failed", { error: error.message });
    return [];
  }
  return (data ?? []) as DbPayment[];
}
