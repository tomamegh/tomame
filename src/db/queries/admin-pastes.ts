import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { ExtractionJobRow, ExtractionRequestStatus } from "@/db/queries/extraction-requests";

/**
 * The paste queue, read as an ADMINISTRATOR rather than as its owner.
 *
 * WHY A SEPARATE FILE. `db/queries/extraction-requests.ts` answers one question
 * — "what did THIS viewer paste" — and every read in it carries an owner filter
 * that IS the authorization, with a comment saying never to drop it. An admin
 * screen asks the opposite question ("what has the extractor been failing on,
 * across everybody"), so it needs reads with no owner filter at all. Keeping
 * those in their own file means nobody can reach for an unscoped read by
 * autocomplete while writing a customer surface.
 *
 * Service role throughout, called only from a route that has already proved the
 * caller is an admin. Data access only: no grouping, no thresholds, no "is this
 * stuck" judgement — that is the service's, and the grouping is a pure function
 * with its own tests.
 */

const JOB_COLUMNS =
  "id, url_hash, product_url, extraction_cache_id, created_at, updated_at, user_id, session_id, status, attempts, started_at, finished_at, error";

/** Which slice of the queue a screen is asking for. */
export type AdminPasteFilter = "failed" | "unfinished" | "all";

/**
 * The rows a buyer works: newest first, because a failure the customer is
 * looking at RIGHT NOW is the one worth acting on. (The assisted queue is the
 * opposite — oldest first — because there a person is already waiting on a
 * reply. These are jobs, not people.)
 */
export async function listAdminPastes(filter: AdminPasteFilter, limit = 100): Promise<ExtractionJobRow[]> {
  let query = createAdminClient().from("extraction_requests").select(JOB_COLUMNS);

  if (filter === "failed") query = query.eq("status", "failed");
  // `pending` and `running` together: from an admin's chair they are one thing
  // — work the machine has accepted and not yet answered. Which of the two a
  // row is in only matters for how long it has been that way, and the service
  // decides that from `started_at`.
  if (filter === "unfinished") query = query.in("status", ["pending", "running"]);

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to load the paste queue: ${error.message}`);
  return (data ?? []) as ExtractionJobRow[];
}

/** Just enough of a row to group outcomes by host. */
export interface PasteOutcome {
  product_url: string;
  status: ExtractionRequestStatus;
}

/**
 * Every paste that has moved within the window, as (link, outcome) pairs.
 *
 * This is what "which stores are failing" is computed from, and it is
 * deliberately the raw outcomes rather than a SQL `group by`: PostgREST cannot
 * group on an expression (the host is inside the URL), and doing it in SQL would
 * put the rule for what counts as a failure in two places.
 *
 * Bounded hard. An admin screen may be slow to think about but it may not pull
 * an unbounded table, and a window wider than a month stops describing what the
 * extractor does TODAY — which is the only thing this number is for.
 */
export async function listRecentPasteOutcomes(sinceIso: string, limit = 1000): Promise<PasteOutcome[]> {
  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select("product_url, status")
    .gt("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load recent pastes: ${error.message}`);
  return (data ?? []) as PasteOutcome[];
}

/** One paste by id, unscoped — for an admin action that has already been authorized. */
export async function getAdminPasteById(id: string): Promise<ExtractionJobRow | null> {
  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load that paste: ${error.message}`);
  return (data as ExtractionJobRow | null) ?? null;
}

export interface AdminPasteStatusCounts {
  pending: number;
  running: number;
  ready: number;
  failed: number;
}

/**
 * How many rows are in each job state right now.
 *
 * Head counts, no rows read — the same discipline `admin-queues.ts` uses for the
 * sidebar badges, and for the same reason: a figure on a card must not cost a
 * table scan. Each one absorbs its own failure, because a tile that cannot be
 * computed should read zero rather than take the screen down.
 */
export async function countAdminPastesByStatus(): Promise<AdminPasteStatusCounts> {
  const db = createAdminClient();
  const statuses: ExtractionRequestStatus[] = ["pending", "running", "ready", "failed"];

  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await db
        .from("extraction_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) {
        logger.warn("admin paste count failed", { status, message: error.message });
        return 0;
      }
      return count ?? 0;
    }),
  );

  return {
    pending: counts[0] ?? 0,
    running: counts[1] ?? 0,
    ready: counts[2] ?? 0,
    failed: counts[3] ?? 0,
  };
}

/** An assisted request that is still in a buyer's hands, for one link. */
export interface AdminAssistedPointer {
  id: string;
  status: "open" | "contacted";
  created_at: string;
}

/**
 * Which of these links somebody has already escaped to a human on, keyed by URL.
 *
 * NOT `listOpenAssistedRequestsByUrl` from `assisted-requests.ts`, which asks the
 * same question scoped to ONE viewer. An admin screen shows failures belonging to
 * many different customers at once, so the viewer-scoped version would have to be
 * called once per distinct owner — dozens of round trips to render one column.
 * The unscoped read is correct here precisely because the caller is an admin, who
 * may see every row in the table anyway.
 *
 * `open` and `contacted` only: once a buyer resolves or cancels the request, the
 * machine's options are back on the table and a re-read is worth offering again.
 */
export async function listOpenAssistedRequestsForUrls(
  productUrls: readonly string[],
): Promise<Map<string, AdminAssistedPointer>> {
  const result = new Map<string, AdminAssistedPointer>();
  const urls = [...new Set(productUrls.filter((u) => u.length > 0))];
  if (urls.length === 0) return result;

  const { data, error } = await createAdminClient()
    .from("assisted_requests")
    .select("id, product_url, status, created_at")
    .in("product_url", urls)
    .in("status", ["open", "contacted"])
    .order("created_at", { ascending: false });

  if (error) {
    // A column that cannot be filled is a column that says nothing, not a page
    // that fails: the failures themselves are the point of the screen.
    logger.warn("admin assisted lookup by url failed", { message: error.message });
    return result;
  }

  for (const row of (data ?? []) as {
    id: string;
    product_url: string;
    status: string;
    created_at: string;
  }[]) {
    // Newest first from the query, so the first one seen per URL is the one that stands.
    if (result.has(row.product_url)) continue;
    if (row.status !== "open" && row.status !== "contacted") continue;
    result.set(row.product_url, { id: row.id, status: row.status, created_at: row.created_at });
  }
  return result;
}
