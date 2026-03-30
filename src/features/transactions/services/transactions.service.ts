import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser, UserProfile } from "@/features/users/types";
import type { PlatformRoles } from "@/features/auth/types";
import type { Payment } from "@/features/payments/types";
import { verifyTransaction } from "@/lib/paystack/client";
import { handlePaymentCallback } from "@/features/payments/services/payments.service";
import type {
  Transaction,
  TransactionDetail,
  TransactionDetailOrder,
  TransactionStats,
} from "../types";

// ── DB queries ────────────────────────────────────────────────────────────────

async function getAllTransactions(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string },
): Promise<Payment[]> {
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
  return (data ?? []) as Payment[];
}

async function getTransactionById(
  client: SupabaseClient,
  id: string,
): Promise<TransactionDetail | null> {
  const { data, error } = await client
    .from("payments")
    .select(
      `*,
      orders(id, product_name, product_image_url, status, origin_country, quantity),
      profiles(id, role, first_name, last_name, bio, created_at, updated_at)`,
    )
    .eq("id", id)
    .single();

  if (error) {
    logger.error("getTransactionById failed", { id, error: error.message });
    return null;
  }

  const row = data as Payment & {
    orders: TransactionDetailOrder[] | null;
    profiles: {
      id: string;
      role: string;
      first_name: string | null;
      last_name: string | null;
      bio: string | null;
      created_at: string;
      updated_at: string;
    } | null;
  };

  // orders is a reverse-FK join → PostgREST returns array; take first
  const orderRow = Array.isArray(row.orders) ? (row.orders[0] ?? null) : null;

  // Build full PlatformUser: profile fields from join + email from auth.users
  let customer: PlatformUser | null = null;
  if (row.profiles) {
    const { data: authData } = await client.auth.admin.getUserById(row.profiles.id);
    if (authData?.user) {
      const p = row.profiles;
      const profile: UserProfile = {
        id: p.id,
        role: p.role as PlatformRoles,
        first_name: p.first_name ?? undefined,
        last_name: p.last_name ?? undefined,
        bio: p.bio ?? undefined,
        created_at: new Date(p.created_at),
        updated_at: new Date(p.updated_at),
      };
      customer = { ...authData.user, profile };
    }
  }

  const paystackData =
    (row.metadata?.paystack_verification as Record<string, unknown>) ?? null;

  return {
    id: row.id,
    user_id: row.user_id,
    reference: row.reference,
    amount: row.amount,
    amount_ghs: row.amount / 100,
    currency: row.currency,
    status: row.status,
    channel: row.channel ?? null,
    metadata: row.metadata,
    created_at: row.created_at,
    order: orderRow,
    customer,
    paystack_data: paystackData,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTransaction(p: Payment): Transaction {
  return {
    ...p,
    channel: p.channel ?? null,
    amount_ghs: p.amount / 100,
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
  user: PlatformUser,
): Promise<TransactionResponse> {
  if (user.profile.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const payments = await getAllTransactions(client);
  const transactions = payments.map(toTransaction);

  const successful = transactions.filter((t) => t.status === "success");
  const stats: TransactionStats = {
    total: transactions.length,
    totalRevenueGhs: successful.reduce((acc, t) => acc + t.amount_ghs, 0),
    successful: successful.length,
    failed: transactions.filter((t) => t.status === "failed").length,
  };

  return { transactions, count: transactions.length, stats };
}

export async function getTransactionDetail(
  client: SupabaseClient,
  user: PlatformUser,
  id: string,
): Promise<TransactionDetail> {
  if (user.profile.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const detail = await getTransactionById(client, id);
  if (!detail) throw new APIError(404, "Transaction not found");

  return detail;
}

export interface SyncResult {
  updated: boolean;
  paystackStatus: string;
  dbStatus: string;
  message: string;
}

export async function syncTransactionStatus(
  client: SupabaseClient,
  user: PlatformUser,
  id: string,
): Promise<SyncResult> {
  if (user.profile.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  // 1. Fetch the payment from DB
  const { data: payment, error } = await client
    .from("payments")
    .select("id, reference, status")
    .eq("id", id)
    .single();

  if (error || !payment) {
    throw new APIError(404, "Transaction not found");
  }

  const dbStatus = payment.status as string;

  // 2. Already finalized — no Paystack call needed
  if (dbStatus === "success" || dbStatus === "failed") {
    return {
      updated: false,
      paystackStatus: dbStatus,
      dbStatus,
      message: `Transaction is already ${dbStatus}. No update needed.`,
    };
  }

  // 3. Verify with Paystack — always server-side
  let paystackStatus: string;
  try {
    const verification = await verifyTransaction(payment.reference as string);
    paystackStatus = verification.data.status; // "success" | "failed" | "abandoned"
  } catch (err) {
    logger.error("syncTransactionStatus: Paystack verify failed", {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new APIError(502, "Could not verify with Paystack. Please try again.");
  }

  // 4. Paystack still shows pending — nothing to do
  if (paystackStatus !== "success" && paystackStatus !== "failed" && paystackStatus !== "abandoned") {
    return {
      updated: false,
      paystackStatus,
      dbStatus,
      message: "Paystack shows the transaction as still pending. No update made.",
    };
  }

  // 5. Status diverges — run the full callback logic (links order, sends notifications, audits)
  try {
    await handlePaymentCallback(payment.reference as string);
  } catch (err) {
    logger.error("syncTransactionStatus: handlePaymentCallback failed", {
      id,
      reference: payment.reference,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new APIError(500, "Sync failed while updating transaction. Please try again.");
  }

  // 6. Read final DB status after update
  const { data: refreshed } = await client
    .from("payments")
    .select("status")
    .eq("id", id)
    .single();

  const finalStatus = (refreshed?.status as string | undefined) ?? paystackStatus;

  return {
    updated: true,
    paystackStatus,
    dbStatus: finalStatus,
    message: `Transaction synced. Status updated to "${finalStatus}".`,
  };
}
