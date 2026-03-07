import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toResponse(p: DbPayment): Transaction {
  return {
    id: p.id,
    userId: p.user_id,
    reference: p.reference,
    amount: p.amount,
    amountGhs: p.amount / 100,
    currency: p.currency,
    status: p.status as Transaction["status"],
    metadata: p.metadata,
    createdAt: p.created_at,
  };
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
): Promise<ServiceResult<TransactionResponse>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const payments = await getAllTransactions(client);
  const mapped = payments.map(toResponse);

  const successful = mapped.filter((t) => t.status === "success");
  const stats: TransactionStats = {
    total: mapped.length,
    totalRevenueGhs: successful.reduce((acc, t) => acc + t.amountGhs, 0),
    successful: successful.length,
    failed: mapped.filter((t) => t.status === "failed").length,
  };

  return {
    success: true,
    data: { transactions: mapped, count: mapped.length, stats },
  };
}
