import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbPayment } from "@/types/db";
import { logger } from "@/lib/logger";

interface PaymentInsert {
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, unknown> | null;
}

export async function insertPayment(
  client: SupabaseClient,
  payment: PaymentInsert
): Promise<DbPayment | null> {
  const { data, error } = await client
    .from("payments")
    .insert(payment)
    .select()
    .single();

  if (error) {
    logger.error("insertPayment failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as DbPayment;
}

export async function getPaymentByReference(
  client: SupabaseClient,
  reference: string
): Promise<DbPayment | null> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .single();

  if (error) return null;
  return data as DbPayment;
}

export async function updatePaymentStatus(
  client: SupabaseClient,
  paymentId: string,
  status: string,
  metadata?: Record<string, unknown>
): Promise<DbPayment | null> {
  const update: Record<string, unknown> = { status };
  if (metadata) {
    update.metadata = metadata;
  }

  const { data, error } = await client
    .from("payments")
    .update(update)
    .eq("id", paymentId)
    .select()
    .single();

  if (error) {
    logger.error("updatePaymentStatus failed", {
      paymentId,
      status,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data as DbPayment;
}
