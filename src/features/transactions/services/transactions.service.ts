import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/types/domain";
import type { DbPayment } from "@/types/db";
import type { Transaction, TransactionStats } from "../types";

// ── DB queries ────────────────────────────────────────────────────────────────

async function getAllTransactions(
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

// ── Service functions ─────────────────────────────────────────────────────────

export interface TransactionResponse {
  transactions: Transaction[];
  count: number;
  stats: TransactionStats;
}

export async function listTransactions(
  client: SupabaseClient,
  user: AuthenticatedUser,
): Promise<TransactionResponse> {
  if (user.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const payments = await getAllTransactions(client);
  const transactions: Transaction[] = payments.map((p) => ({
    ...p,
    amount_ghs: p.amount / 100,
  }));

  const successful = transactions.filter((t) => t.status === "success");
  const stats: TransactionStats = {
    total: transactions.length,
    totalRevenueGhs: successful.reduce((acc, t) => acc + t.amount_ghs, 0),
    successful: successful.length,
    failed: transactions.filter((t) => t.status === "failed").length,
  };

  return { transactions, count: transactions.length, stats };
}
