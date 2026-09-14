import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** One grouped issue from `error_events` (062). */
export interface ErrorIssueRow {
  fingerprint: string;
  level: "error" | "warn";
  message: string;
  source: string | null;
  context: Record<string, unknown> | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

export interface ErrorHealth {
  /** Unresolved issues, newest occurrence first, capped for the screen. */
  open: ErrorIssueRow[];
  /** Unresolved issues in total, which may exceed what `open` lists. */
  openTotal: number;
  /** Issues whose FIRST occurrence was in the last day: something new broke. */
  newToday: number;
  /** Occurrences across all unresolved issues in the last day. */
  occurrences24h: number;
}

const COLUMNS = "fingerprint, level, message, source, context, occurrences, first_seen_at, last_seen_at, resolved_at";
const LIST_LIMIT = 25;

export async function readErrorHealth(now: Date): Promise<ErrorHealth> {
  const client = createAdminClient();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();

  const [openRes, totalRes, newRes] = await Promise.all([
    client
      .from("error_events")
      .select(COLUMNS)
      .is("resolved_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(LIST_LIMIT),
    client.from("error_events").select("fingerprint", { count: "exact", head: true }).is("resolved_at", null),
    client
      .from("error_events")
      .select("fingerprint", { count: "exact", head: true })
      .is("resolved_at", null)
      .gte("first_seen_at", dayAgo),
  ]);

  if (openRes.error) throw new Error(`ops error issues failed: ${openRes.error.message}`);
  if (totalRes.error) throw new Error(`ops error count failed: ${totalRes.error.message}`);
  if (newRes.error) throw new Error(`ops new error count failed: ${newRes.error.message}`);

  const open = (openRes.data ?? []) as unknown as ErrorIssueRow[];
  return {
    open,
    openTotal: totalRes.count ?? 0,
    newToday: newRes.count ?? 0,
    occurrences24h: open
      .filter((i) => i.last_seen_at >= dayAgo)
      .reduce((sum, i) => sum + Number(i.occurrences), 0),
  };
}

/**
 * Mark one issue dealt with. A later occurrence clears this again (the RPC in
 * 062 sets `resolved_at` back to NULL), so this is "I have looked at it", not a
 * way to silence something still happening.
 */
export async function resolveErrorIssue(fingerprint: string, adminId: string): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("error_events")
    .update({ resolved_at: new Date().toISOString(), resolved_by: adminId })
    .eq("fingerprint", fingerprint)
    .is("resolved_at", null)
    .select("fingerprint");
  if (error) throw new Error(`Failed to resolve error issue: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
