import type { AiUsageRow } from "@/db/queries/ai-usage";

/**
 * One day of assistant use, per person (Kelvin, 2026-11-23: "track invocations
 * made by users to the AI and how many made in a day so I know no one is
 * abusing it"). Pure: the page loads the rows and the names.
 *
 * A signed-in customer is one person. A visitor is grouped by their hashed IP
 * (a cleared cookie does not make a new person), else by their cookie.
 */

export interface AiUsagePerson {
  key: string;
  userId: string | null;
  kind: "customer" | "visitor";
  /** Chat messages answered by the model. */
  chats: number;
  /** Search runs started. */
  searches: number;
  /** Turned away by a rate limit or the visitor sign-in wall. */
  refused: number;
  inputTokens: number;
  outputTokens: number;
  first: string;
  last: string;
  /** Distinct cookies seen for a visitor: one IP with many is someone clearing cookies. */
  sessions: number;
  /** Over the line a normal shopper never reaches in a day. */
  flagged: boolean;
}

export interface AiUsageTotals {
  chats: number;
  searches: number;
  refused: number;
  customers: number;
  visitors: number;
  inputTokens: number;
  outputTokens: number;
}

/** A day a normal shopper never exceeds; above it, the row is flagged for a look. */
export const AI_USAGE_FLAG = {
  customer: { chats: 80, searches: 15 },
  visitor: { chats: 25, searches: 3 },
} as const;

export function personKeyOf(row: Pick<AiUsageRow, "user_id" | "ip_hash" | "session_id">): string {
  if (row.user_id) return `user:${row.user_id}`;
  if (row.ip_hash) return `ip:${row.ip_hash}`;
  return `session:${row.session_id ?? "unknown"}`;
}

export function summariseAiUsage(rows: readonly AiUsageRow[]): { totals: AiUsageTotals; people: AiUsagePerson[] } {
  const people = new Map<string, AiUsagePerson & { sessionSet: Set<string> }>();
  for (const r of rows) {
    const key = personKeyOf(r);
    const p =
      people.get(key) ??
      {
        key,
        userId: r.user_id,
        kind: r.user_id ? ("customer" as const) : ("visitor" as const),
        chats: 0,
        searches: 0,
        refused: 0,
        inputTokens: 0,
        outputTokens: 0,
        first: r.created_at,
        last: r.created_at,
        sessions: 0,
        flagged: false,
        sessionSet: new Set<string>(),
      };
    if (r.outcome !== "ok") p.refused += 1;
    else if (r.kind === "chat") p.chats += 1;
    else p.searches += 1;
    p.inputTokens += r.input_tokens;
    p.outputTokens += r.output_tokens;
    if (r.created_at < p.first) p.first = r.created_at;
    if (r.created_at > p.last) p.last = r.created_at;
    if (r.session_id) p.sessionSet.add(r.session_id);
    people.set(key, p);
  }
  const list: AiUsagePerson[] = [...people.values()].map(({ sessionSet, ...p }) => {
    const line = AI_USAGE_FLAG[p.kind];
    return { ...p, sessions: sessionSet.size, flagged: p.chats > line.chats || p.searches > line.searches || p.refused > 0 || (p.kind === "visitor" && sessionSet.size > 3) };
  });
  list.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.chats + b.searches - (a.chats + a.searches) || (a.last < b.last ? 1 : -1));
  const totals: AiUsageTotals = {
    chats: list.reduce((n, p) => n + p.chats, 0),
    searches: list.reduce((n, p) => n + p.searches, 0),
    refused: list.reduce((n, p) => n + p.refused, 0),
    customers: list.filter((p) => p.kind === "customer").length,
    visitors: list.filter((p) => p.kind === "visitor").length,
    inputTokens: list.reduce((n, p) => n + p.inputTokens, 0),
    outputTokens: list.reduce((n, p) => n + p.outputTokens, 0),
  };
  return { totals, people: list };
}

/** Per-day counts for the trend strip, oldest first, every day present. */
export function dailyCounts(rows: readonly AiUsageRow[], days: readonly string[]): Array<{ day: string; chats: number; searches: number; refused: number }> {
  const out = new Map(days.map((d) => [d, { day: d, chats: 0, searches: 0, refused: 0 }]));
  for (const r of rows) {
    const d = out.get(r.created_at.slice(0, 10));
    if (!d) continue;
    if (r.outcome !== "ok") d.refused += 1;
    else if (r.kind === "chat") d.chats += 1;
    else d.searches += 1;
  }
  return days.map((d) => out.get(d)!);
}

/** The `days` YYYY-MM-DD strings ending on `last` (UTC; Accra is UTC). */
export function dayRange(last: string, days: number): string[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}
