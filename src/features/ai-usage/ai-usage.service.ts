import "server-only";

import { getOrderCustomer } from "@/db/queries/admin-orders";
import { insertAiUsage, listAiUsageBetween, type AiUsageKind, type AiUsageOutcome } from "@/db/queries/ai-usage";
import { dailyCounts, dayRange, summariseAiUsage, type AiUsagePerson, type AiUsageTotals } from "./summary";

export interface RecordAiUsageInput {
  kind: AiUsageKind;
  outcome?: AiUsageOutcome;
  userId: string | null;
  sessionId: string | null;
  ipHash?: string | null;
  refId?: string | null;
  tokens?: { input: number; output: number };
}

/** One assistant call. Never throws. */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  await insertAiUsage({
    kind: input.kind,
    outcome: input.outcome ?? "ok",
    user_id: input.userId,
    session_id: input.sessionId,
    ip_hash: input.ipHash ?? null,
    ref_id: input.refId ?? null,
    input_tokens: Math.max(0, Math.round(input.tokens?.input ?? 0)),
    output_tokens: Math.max(0, Math.round(input.tokens?.output ?? 0)),
  });
}

export interface AiUsageDayView {
  day: string;
  totals: AiUsageTotals;
  people: Array<AiUsagePerson & { name: string | null; email: string | null }>;
  trend: Array<{ day: string; chats: number; searches: number; refused: number }>;
}

const TREND_DAYS = 14;

/** One day's use per person, with the 14 days before it for the trend. */
export async function getAiUsageDay(day: string): Promise<AiUsageDayView> {
  const days = dayRange(day, TREND_DAYS);
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString();
  const rows = await listAiUsageBetween(`${days[0]}T00:00:00Z`, next);
  const today = rows.filter((r) => r.created_at.slice(0, 10) === day);
  const { totals, people } = summariseAiUsage(today);
  const named = await Promise.all(
    people.map(async (p) => {
      if (!p.userId) return { ...p, name: null, email: null };
      const c = await getOrderCustomer(p.userId).catch(() => null);
      return { ...p, name: c?.name ?? null, email: c?.email ?? null };
    }),
  );
  return { day, totals, people: named, trend: dailyCounts(rows, days) };
}
