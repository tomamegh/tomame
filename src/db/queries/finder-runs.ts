import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { FinderEvent, FinderRunStatus } from "@/features/finder/types";
import type { RequestViewer } from "./extraction-requests";

/**
 * `finder_runs` (migration 105). Service role throughout, with an explicit
 * owner filter on every viewer read: a visitor is identified by the
 * `tm_quote_session` cookie, which PostgREST knows nothing about, so the
 * filter IS the authorization. Never drop it.
 */

export interface FinderRunRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  query: string;
  query_key: string;
  budget_ghs: number | null;
  spec: Record<string, unknown> | null;
  status: FinderRunStatus;
  events: FinderEvent[];
  result: Record<string, unknown> | null;
  email: string | null;
  notify_whatsapp: boolean;
  emailed_at: string | null;
  vendor_searches: number;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, user_id, session_id, query, query_key, budget_ghs, spec, status, events, result, email, notify_whatsapp, emailed_at, vendor_searches, attempts, started_at, finished_at, error, created_at, updated_at";

const nowIso = () => new Date().toISOString();

function ownerFilter(viewer: RequestViewer): { column: "user_id" | "session_id"; value: string } | null {
  if (viewer.userId) return { column: "user_id", value: viewer.userId };
  if (viewer.sessionId) return { column: "session_id", value: viewer.sessionId };
  return null;
}

export async function insertFinderRun(input: {
  viewer: RequestViewer;
  query: string;
  queryKey: string;
  budgetGhs: number | null;
  email: string | null;
  notifyWhatsapp: boolean;
  events: FinderEvent[];
}): Promise<FinderRunRow> {
  const owner = ownerFilter(input.viewer);
  if (!owner) throw new Error("A finder run needs an owner");
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .insert({
      [owner.column]: owner.value,
      query: input.query,
      query_key: input.queryKey,
      budget_ghs: input.budgetGhs,
      email: input.email,
      notify_whatsapp: input.notifyWhatsapp,
      events: input.events,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create finder run: ${error.message}`);
  return data as FinderRunRow;
}

/**
 * The viewer's run. A signed-in viewer also sees a run their session cookie
 * started before they signed in, and that run moves to them on this read (the
 * adoption 049 does for pastes).
 */
export async function getFinderRunForViewer(id: string, viewer: RequestViewer): Promise<FinderRunRow | null> {
  const db = createAdminClient();
  let query = db.from("finder_runs").select(COLUMNS).eq("id", id);
  if (viewer.userId && viewer.sessionId) {
    query = query.or(`user_id.eq.${viewer.userId},session_id.eq.${viewer.sessionId}`);
  } else {
    const owner = ownerFilter(viewer);
    if (!owner) return null;
    query = query.eq(owner.column, owner.value);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load finder run: ${error.message}`);
  const row = (data as FinderRunRow | null) ?? null;

  if (row && !row.user_id && viewer.userId && row.session_id === viewer.sessionId) {
    const { error: adoptError } = await db
      .from("finder_runs")
      .update({ user_id: viewer.userId, session_id: null })
      .eq("id", row.id)
      .eq("session_id", row.session_id);
    if (adoptError) logger.warn("finder run adoption failed", { id: row.id, message: adoptError.message });
    else return { ...row, user_id: viewer.userId, session_id: null };
  }
  return row;
}

/** The viewer's newest run of this normalised request since `sinceIso` that did not fail. */
export async function findRecentFinderRun(viewer: RequestViewer, queryKey: string, sinceIso: string): Promise<FinderRunRow | null> {
  const owner = ownerFilter(viewer);
  if (!owner) return null;
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .select(COLUMNS)
    .eq(owner.column, owner.value)
    .eq("query_key", queryKey)
    .neq("status", "failed")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up finder runs: ${error.message}`);
  return (data as FinderRunRow | null) ?? null;
}

/**
 * Claim a run for this worker: `pending → running`, guarded on the status, so
 * the `after()` start and the sweep can race and only one proceeds. The
 * narration starts again from the given events: a re-driven run says what it
 * does this time, not what a dead worker half-said.
 */
export async function claimFinderRun(id: string, events: FinderEvent[]): Promise<FinderRunRow | null> {
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .update({ status: "running", started_at: nowIso(), updated_at: nowIso(), events, result: null, error: null })
    .eq("id", id)
    .eq("status", "pending")
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    logger.warn("finder run claim failed", { id, message: error.message });
    return null;
  }
  return (data as FinderRunRow | null) ?? null;
}

/** Write the narration so far. Only the claiming worker writes a running row. */
export async function saveFinderProgress(
  id: string,
  patch: { events: FinderEvent[]; spec?: Record<string, unknown> | null; vendorSearches?: number },
): Promise<void> {
  const { error } = await createAdminClient()
    .from("finder_runs")
    .update({
      events: patch.events,
      ...(patch.spec !== undefined ? { spec: patch.spec } : {}),
      ...(patch.vendorSearches !== undefined ? { vendor_searches: patch.vendorSearches } : {}),
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq("status", "running");
  if (error) logger.warn("finder progress write failed", { id, message: error.message });
}

/** Settle a run. Guarded on `running` so a reclaimed run's late worker cannot overwrite the new one. */
export async function completeFinderRun(input: {
  id: string;
  status: "done" | "no_match" | "failed";
  events: FinderEvent[];
  result: Record<string, unknown> | null;
  attempts: number;
  vendorSearches: number;
  error?: string | null;
}): Promise<FinderRunRow | null> {
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .update({
      status: input.status,
      events: input.events,
      result: input.result,
      attempts: input.attempts,
      vendor_searches: input.vendorSearches,
      error: input.error ?? null,
      finished_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", input.id)
    .eq("status", "running")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to settle finder run: ${error.message}`);
  return (data as FinderRunRow | null) ?? null;
}

/** Put a failed attempt back for the sweep. */
export async function requeueFinderRun(id: string, attempts: number, message: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("finder_runs")
    .update({ status: "pending", attempts, started_at: null, error: message.slice(0, 500), updated_at: nowIso() })
    .eq("id", id)
    .eq("status", "running");
  if (error) logger.warn("finder run requeue failed", { id, message: error.message });
}

/** Stamp the email as sent, once: false when another worker already did. */
export async function markFinderRunEmailed(id: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .update({ emailed_at: nowIso() })
    .eq("id", id)
    .is("emailed_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    logger.warn("finder run emailed stamp failed", { id, message: error.message });
    return false;
  }
  return data != null;
}

/** Undo the stamp when the send itself failed, so a later read can try again. */
export async function clearFinderRunEmailed(id: string): Promise<void> {
  await createAdminClient().from("finder_runs").update({ emailed_at: null }).eq("id", id);
}

/** The viewer's contact choices for one run. Owner-filtered: the filter is the authorization. */
export async function updateFinderRunContact(
  id: string,
  viewer: RequestViewer,
  patch: { email?: string | null; notifyWhatsapp?: boolean },
): Promise<FinderRunRow | null> {
  const owner = ownerFilter(viewer);
  if (!owner) return null;
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .update({
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.notifyWhatsapp !== undefined ? { notify_whatsapp: patch.notifyWhatsapp } : {}),
      updated_at: nowIso(),
    })
    .eq("id", id)
    .eq(owner.column, owner.value)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update finder run: ${error.message}`);
  return (data as FinderRunRow | null) ?? null;
}

/**
 * Release runs whose worker never came back. One with tries left goes back to
 * `pending`; one out of tries fails, with `failEvent` closing its narration so
 * the screen stops saying it is working.
 */
export async function reclaimStaleFinderRuns(
  staleAfterMs: number,
  maxAttempts: number,
  failEvent: (run: FinderRunRow) => FinderEvent,
): Promise<{ touched: number; failed: FinderRunRow[] }> {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const db = createAdminClient();
  const { data, error } = await db
    .from("finder_runs")
    .select(COLUMNS)
    .eq("status", "running")
    .or(`started_at.lt.${cutoff},started_at.is.null`)
    .limit(20);
  if (error || !data?.length) return { touched: 0, failed: [] };

  const failed: FinderRunRow[] = [];
  for (const row of data as FinderRunRow[]) {
    const attempts = row.attempts + 1;
    const exhausted = attempts >= maxAttempts;
    const { data: updated } = await db
      .from("finder_runs")
      .update(
        exhausted
          ? { status: "failed", attempts, events: [...row.events, failEvent(row)], error: "Worker lost; out of attempts", finished_at: nowIso(), updated_at: nowIso() }
          : { status: "pending", attempts, started_at: null, updated_at: nowIso() },
      )
      .eq("id", row.id)
      .eq("status", "running")
      .select(COLUMNS)
      .maybeSingle();
    if (exhausted && updated) failed.push(updated as FinderRunRow);
  }
  return { touched: data.length, failed };
}

/** Pending runs nothing started within `olderThanMs`, oldest first. */
export async function listStalePendingFinderRuns(olderThanMs: number, limit: number): Promise<Pick<FinderRunRow, "id">[]> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .select("id")
    .eq("status", "pending")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to list queued finder runs: ${error.message}`);
  return (data ?? []) as Pick<FinderRunRow, "id">[];
}

/** One run by id, unscoped: the worker, which owns no viewer. Never expose to a request handler. */
export async function getFinderRunById(id: string): Promise<FinderRunRow | null> {
  const { data, error } = await createAdminClient().from("finder_runs").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load finder run: ${error.message}`);
  return (data as FinderRunRow | null) ?? null;
}

export interface FinderHealthRow {
  status: FinderRunStatus;
  vendor_searches: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

/** Runs created since `sinceIso`, for the daily health line. */
export async function listFinderRunsSince(sinceIso: string): Promise<FinderHealthRow[]> {
  const { data, error } = await createAdminClient()
    .from("finder_runs")
    .select("status, vendor_searches, started_at, finished_at, created_at")
    .gte("created_at", sinceIso)
    .limit(5000);
  if (error) throw new Error(`Failed to read finder runs: ${error.message}`);
  return (data ?? []) as FinderHealthRow[];
}
