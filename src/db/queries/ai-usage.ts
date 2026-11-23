import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** `ai_usage_events` (140). Service role only: a usage log no customer reads. */

export type AiUsageKind = "chat" | "search";
export type AiUsageOutcome = "ok" | "rate_limited" | "sign_in_required";

export interface AiUsageRow {
  id: string;
  created_at: string;
  user_id: string | null;
  session_id: string | null;
  ip_hash: string | null;
  kind: AiUsageKind;
  outcome: AiUsageOutcome;
  ref_id: string | null;
  input_tokens: number;
  output_tokens: number;
}

export type NewAiUsage = Omit<AiUsageRow, "id" | "created_at">;

/** Never throws: a usage row is bookkeeping, and must not fail the customer's request. */
export async function insertAiUsage(row: NewAiUsage): Promise<void> {
  try {
    const { error } = await createAdminClient().from("ai_usage_events").insert(row);
    if (error) logger.warn("ai usage: insert failed", { message: error.message, kind: row.kind });
  } catch (error) {
    logger.warn("ai usage: insert threw", { error: error instanceof Error ? error.message : String(error) });
  }
}

const COLUMNS = "id, created_at, user_id, session_id, ip_hash, kind, outcome, ref_id, input_tokens, output_tokens";

/** Every row in [from, to), oldest first. Bounded: a day of heavy abuse still fits. */
export async function listAiUsageBetween(from: string, to: string, limit = 20_000): Promise<AiUsageRow[]> {
  const { data, error } = await createAdminClient()
    .from("ai_usage_events")
    .select(COLUMNS)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load AI usage: ${error.message}`);
  return (data ?? []) as AiUsageRow[];
}
