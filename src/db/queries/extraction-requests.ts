import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * `extraction_requests` — which customer pasted which link (migration 041).
 *
 * Not the same question as `extraction_cache`. Migration 035 re-keyed the cache
 * to be PRODUCT-keyed (unique on `url_hash` alone) so many customers share one
 * extraction; its `user_id` is only "who requested it most recently" and is
 * overwritten by the next customer to paste the same URL. This table records the
 * (user, link) fact directly, one row per pair, and points at the shared
 * extraction for the priced result.
 */

export interface ExtractionRequestRow {
  id: string;
  url_hash: string;
  product_url: string;
  /** NULL once the cache row is pruned (FK is ON DELETE SET NULL). */
  extraction_cache_id: string | null;
  created_at: string;
  /** Bumped on every repeat paste — this is the column the Home card orders by. */
  updated_at: string;
}

const COLUMNS =
  "id, url_hash, product_url, extraction_cache_id, created_at, updated_at";

/**
 * The newest link this customer pasted. Takes the caller's client so the
 * cookie-bound (RLS-enforced) client can be used — ownership is enforced by the
 * `extraction_requests owner read` policy, not by trusting this filter.
 *
 * Returns the request row only. The priced result lives in `extraction_cache`,
 * which has RLS enabled with no policies by design (shared, product-keyed data),
 * so it cannot be embedded here — the service reads it through
 * `db/queries/extraction-cache`.
 */
export async function getLatestExtractionRequest(
  client: SupabaseClient,
  userId: string,
): Promise<ExtractionRequestRow | null> {
  // The newest paste that actually HAS an extraction.
  //
  // Since 049 a row exists the instant a link is pasted, not once it has been
  // read. Taking the newest row outright would hand Home a paste with nothing
  // behind it, `buildReceipt` would return null, and the Live receipt card the
  // customer was just looking at would VANISH the moment they pasted something
  // new — reappearing only when the job landed. Showing the previous receipt
  // until the new one is ready is the honest behaviour; the pending paste has
  // its own place in the bag.
  const { data, error } = await client
    .from("extraction_requests")
    .select(COLUMNS)
    .eq("user_id", userId)
    .not("extraction_cache_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load extraction requests: ${error.message}`);
  }

  return (data as ExtractionRequestRow | null) ?? null;
}

// ── The paste queue (049) ────────────────────────────────────────────────────

/** Job state of a paste. `ready` means `extraction_cache_id` is usable. */
export type ExtractionRequestStatus = "pending" | "running" | "ready" | "failed";

/** One viewer — a signed-in customer or a `tm_quote_session` cookie. Exactly one is set. */
export interface RequestViewer {
  userId: string | null;
  sessionId: string | null;
}

export interface ExtractionJobRow extends ExtractionRequestRow {
  user_id: string | null;
  session_id: string | null;
  status: ExtractionRequestStatus;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  /** 106: when this link was last asked to be read (paste, re-paste, retry button). Null on rows from before 106. */
  queued_at?: string | null;
  /** 106: the sweep leaves a requeued job alone until then. */
  not_before?: string | null;
}

const JOB_COLUMNS =
  "id, url_hash, product_url, extraction_cache_id, created_at, updated_at, user_id, session_id, status, attempts, started_at, finished_at, error, queued_at, not_before";

/** The column that owns a row, and its value. Exactly one identity, enforced by a CHECK in 049. */
function ownerFilter(viewer: RequestViewer): { column: "user_id" | "session_id"; value: string } | null {
  if (viewer.userId) return { column: "user_id", value: viewer.userId };
  if (viewer.sessionId) return { column: "session_id", value: viewer.sessionId };
  return null;
}

/**
 * Put a paste on the queue, or return the row that is already there.
 *
 * Upserted on (viewer, url_hash) — the same uniqueness 046 had, restored as two
 * partial indexes in 049 now that `user_id` can be null. A repeat paste of a link
 * that is still reading joins the existing job rather than starting a second one;
 * a repeat paste of one that FAILED resets it to `pending` so the customer's
 * retry actually retries.
 *
 * `cachedId` short-circuits the whole queue: a product-keyed cache hit is already
 * the answer, so the row is written `ready` and nothing is ever scheduled.
 */
export async function enqueueExtractionRequest(input: {
  viewer: RequestViewer;
  urlHash: string;
  productUrl: string;
  cachedId: string | null;
  /**
   * 106: the cached read is stale; queue a fresh read while `cachedId` keeps
   * serving the old figures (the row is `pending` WITH an extraction).
   */
  recheck?: boolean;
}): Promise<ExtractionJobRow | null> {
  const owner = ownerFilter(input.viewer);
  if (!owner) return null;

  const db = createAdminClient();
  const existing = await findExtractionRequestByUrl(input.viewer, input.urlHash);

  // A row in flight is left exactly as it is: resetting a `running` job to
  // `pending` would let the sweeper start a second worker on it.
  if (existing?.status === "running") return existing;
  // A re-check already queued is not undone by a cache-hit write (the job's own
  // `notePaste`, or a second paste); a second re-check request joins it.
  if (existing?.status === "pending" && (existing.extraction_cache_id || input.recheck)) return existing;

  // A row that is `ready` is only final while its answer still stands. `cachedId`
  // is the product-keyed cache row that is VALID right now; when it is null the
  // quote this row points at has lapsed or been pruned, and the paste must go
  // round again. This guard used to return any `ready` row untouched, which made
  // "Read it again" on a lapsed quote — and re-pasting the same link — a silent
  // no-op: the same expired row came back, no job was scheduled, and the screen
  // did not so much as blink.
  if (existing?.status === "ready" && existing.extraction_cache_id && input.cachedId && !input.recheck) return existing;

  const ready = input.cachedId != null && !input.recheck;
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("extraction_requests")
    .upsert(
      {
        [owner.column]: owner.value,
        url_hash: input.urlHash,
        product_url: input.productUrl,
        extraction_cache_id: input.cachedId,
        status: ready ? "ready" : "pending",
        attempts: 0,
        error: null,
        started_at: null,
        finished_at: ready ? now : null,
        updated_at: now,
        queued_at: now,
        not_before: null,
      },
      // `owner_key` is the generated column 049 added (coalesce(user_id, session_id)).
      // Conflict is inferred on it rather than on whichever identity column this
      // viewer uses, because ON CONFLICT needs one plain unique index to point at.
      { onConflict: "owner_key,url_hash" },
    )
    .select(JOB_COLUMNS)
    .maybeSingle();

  if (error) {
    logger.warn("extraction request enqueue failed", { code: error.code, message: error.message });
    return null;
  }
  return data as ExtractionJobRow | null;
}

/** One viewer's row for a link, whatever state it is in. */
export async function findExtractionRequestByUrl(
  viewer: RequestViewer,
  urlHash: string,
): Promise<ExtractionJobRow | null> {
  const owner = ownerFilter(viewer);
  if (!owner) return null;

  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select(JOB_COLUMNS)
    .eq(owner.column, owner.value)
    .eq("url_hash", urlHash)
    .maybeSingle();

  if (error) throw new Error(`Failed to load extraction request: ${error.message}`);
  return (data as ExtractionJobRow | null) ?? null;
}

/**
 * One job by id, scoped to the viewer who owns it.
 *
 * Service role with an explicit owner filter rather than the cookie-bound client:
 * a signed-out viewer is identified by `tm_quote_session`, which PostgREST knows
 * nothing about. The filter is the authorization — never drop it.
 */
export async function getExtractionRequestForViewer(
  id: string,
  viewer: RequestViewer,
): Promise<ExtractionJobRow | null> {
  const owner = ownerFilter(viewer);
  if (!owner) return null;

  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .eq(owner.column, owner.value)
    .maybeSingle();

  if (error) throw new Error(`Failed to load extraction request: ${error.message}`);
  return (data as ExtractionJobRow | null) ?? null;
}

/**
 * Claim one job for this worker, atomically.
 *
 * `pending → running` guarded on the current status, so two workers racing for
 * the same row cannot both win: the loser's update matches nothing and returns
 * null. This is the same `.eq(status, from)` idempotency the payment transitions
 * use, and it is what makes `after()` and the cron sweep safe to overlap.
 */
export async function claimExtractionRequest(id: string): Promise<ExtractionJobRow | null> {
  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select(JOB_COLUMNS)
    .maybeSingle();

  if (error) {
    logger.warn("extraction request claim failed", { id, message: error.message });
    return null;
  }
  return (data as ExtractionJobRow | null) ?? null;
}

/** Finish a job: `ready` with a cache row, or `failed` with something to show the customer. */
export async function completeExtractionRequest(input: {
  id: string;
  status: "ready" | "failed";
  extractionCacheId?: string | null;
  error?: string | null;
  attempts: number;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from("extraction_requests")
    .update({
      status: input.status,
      extraction_cache_id: input.extractionCacheId ?? null,
      error: input.error ?? null,
      attempts: input.attempts,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) logger.warn("extraction request completion failed", { id: input.id, message: error.message });
}

/**
 * Release a job whose worker never came back.
 *
 * A `running` row older than `staleAfterMs` means the invocation that held it
 * died — a deploy, a crash, a function timeout. It goes back to `pending` so the
 * sweeper can retry it, unless it has already burned its attempts, in which case
 * it fails with something the customer can read.
 */
export async function reclaimStaleExtractionRequests(staleAfterMs: number, maxAttempts: number): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const db = createAdminClient();

  // `started_at IS NULL` would fail the `<` comparison and leave such a row
  // running forever, showing "still reading" on a line nothing will ever retry.
  // A claim always writes both, so this is belt and braces — but the failure it
  // guards against is silent and permanent.
  const { data, error } = await db
    .from("extraction_requests")
    .select("id, attempts, extraction_cache_id")
    .eq("status", "running")
    .or(`started_at.lt.${cutoff},started_at.is.null`)
    .limit(50);

  if (error || !data?.length) return 0;

  for (const row of data as { id: string; attempts: number; extraction_cache_id: string | null }[]) {
    const exhausted = row.attempts + 1 >= maxAttempts;
    await db
      .from("extraction_requests")
      .update(
        // A re-check that keeps dying settles on the figures it already had (106).
        exhausted && row.extraction_cache_id
          ? { status: "ready", attempts: row.attempts + 1, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          : exhausted
          ? {
              status: "failed",
              error: "We could not read that page. Tell us what you want instead and a buyer will help.",
              attempts: row.attempts + 1,
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : { status: "pending", attempts: row.attempts + 1, started_at: null, updated_at: new Date().toISOString() },
      )
      .eq("id", row.id)
      .eq("status", "running");
  }
  return data.length;
}

/** Oldest queued work first. The sweeper's batch; the route bounds how many it takes. */
export async function listQueuedExtractionRequests(limit: number): Promise<ExtractionJobRow[]> {
  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select(JOB_COLUMNS)
    .eq("status", "pending")
    // A retry waiting out its delay (106) is not due yet.
    .or(`not_before.is.null,not_before.lte.${new Date().toISOString()}`)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to list queued extractions: ${error.message}`);
  return (data ?? []) as ExtractionJobRow[];
}

/**
 * Move a session's pastes onto the user at sign-in, mirroring the cart adoption
 * in 048. Rows the user already has for the same link are left alone — their own
 * row wins — and the orphaned session row is dropped so the partial unique index
 * on (session_id, url_hash) cannot collide later.
 */
export async function adoptExtractionRequests(sessionId: string, userId: string): Promise<void> {
  const db = createAdminClient();
  const { data: mine } = await db.from("extraction_requests").select("url_hash").eq("user_id", userId);
  const taken = new Set((mine ?? []).map((r) => (r as { url_hash: string }).url_hash));

  const { data: theirs } = await db
    .from("extraction_requests")
    .select("id, url_hash")
    .eq("session_id", sessionId);

  for (const row of (theirs ?? []) as { id: string; url_hash: string }[]) {
    if (taken.has(row.url_hash)) {
      await db.from("extraction_requests").delete().eq("id", row.id);
      continue;
    }
    await db.from("extraction_requests").update({ user_id: userId, session_id: null }).eq("id", row.id);
  }
}

/**
 * Put a failed attempt back on the queue for the next sweep.
 *
 * Deliberately NOT `completeExtractionRequest({status:'pending'})`: completing a
 * job stamps `finished_at`, and a job going round again has not finished. It also
 * clears `started_at`, so the stale-reclaim cutoff cannot fire on a row that is
 * merely waiting its turn.
 */
export async function requeueExtractionRequest(id: string, attempts: number, notBefore: Date | null = null): Promise<void> {
  const { error } = await createAdminClient()
    .from("extraction_requests")
    .update({
      status: "pending",
      attempts,
      started_at: null,
      finished_at: null,
      updated_at: new Date().toISOString(),
      not_before: notBefore ? notBefore.toISOString() : null,
    })
    .eq("id", id);

  if (error) logger.warn("extraction request requeue failed", { id, message: error.message });
}

/** What a paste that waited too long ends as: a re-check keeps its old figures, a first read fails. */
export const GIVE_UP_ERROR = "We couldn't read that page. Ask a buyer and we'll find it for you.";

/**
 * End every paste still `pending`/`running` whose customer has waited past
 * `olderThanMs` since asking (106 `queued_at`; `updated_at` for older rows).
 * A re-check (it names an extraction) settles `ready` on the figures it
 * already had; anything else fails with "Ask a buyer". Guarded on the status
 * read, so a job finishing at the same moment wins. Scoped to one viewer when
 * given (the list read), every row otherwise (the sweep). Returns how many ended.
 */
export async function giveUpStuckExtractionRequests(olderThanMs: number, viewer?: RequestViewer): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const db = createAdminClient();
  let query = db
    .from("extraction_requests")
    .select("id, status, extraction_cache_id")
    .in("status", ["pending", "running"])
    .or(`queued_at.lt.${cutoff},and(queued_at.is.null,updated_at.lt.${cutoff})`)
    .limit(50);
  if (viewer) {
    const owner = ownerFilter(viewer);
    if (!owner) return 0;
    query = query.eq(owner.column, owner.value);
  }
  const { data, error } = await query;
  if (error || !data?.length) return 0;

  let ended = 0;
  const now = new Date().toISOString();
  for (const row of data as { id: string; status: ExtractionRequestStatus; extraction_cache_id: string | null }[]) {
    const { data: updated } = await db
      .from("extraction_requests")
      .update(
        row.extraction_cache_id
          ? { status: "ready", error: null, finished_at: now, updated_at: now, not_before: null }
          : { status: "failed", error: GIVE_UP_ERROR, finished_at: now, updated_at: now, not_before: null },
      )
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id");
    ended += updated?.length ?? 0;
  }
  if (ended) logger.warn("extraction requests: gave up on stuck pastes", { ended });
  return ended;
}

/**
 * Whether a fresh read of this extraction is queued or running right now
 * (a re-check, 106): the quote screen marks its figures "Re-checking…" and
 * keeps asking. Rows past the give-up window do not count.
 */
export async function hasOpenRecheck(extractionCacheId: string, withinMs: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinMs).toISOString();
  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select("id")
    .eq("extraction_cache_id", extractionCacheId)
    .in("status", ["pending", "running"])
    .gt("queued_at", cutoff)
    .limit(1);
  if (error) {
    logger.warn("extraction requests: re-check lookup failed", { message: error.message });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * One job by id, unscoped.
 *
 * For server-side callers that already proved ownership by another route — the
 * bag reaches a request only through a cart line it has just verified belongs to
 * the viewer, so re-deriving the owner here would be theatre. Never expose this
 * to a request handler that has not done that check.
 */
export async function getExtractionRequestById(id: string): Promise<ExtractionJobRow | null> {
  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load extraction request: ${error.message}`);
  return (data as ExtractionJobRow | null) ?? null;
}

/**
 * The viewer's recent pastes, newest first — what the Buy-for-me screen shows
 * as "reading now" and "recently pasted".
 *
 * Service role with an explicit owner filter, like `getExtractionRequestForViewer`
 * and for the same reason: a signed-out viewer is identified by the
 * `tm_quote_session` cookie, which PostgREST knows nothing about. The filter IS
 * the authorization — never drop it.
 */
export async function listPastesForViewer(viewer: RequestViewer, limit = 12): Promise<ExtractionJobRow[]> {
  const owner = ownerFilter(viewer);
  if (!owner) return [];

  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select(JOB_COLUMNS)
    .eq(owner.column, owner.value)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load pastes: ${error.message}`);
  return (data ?? []) as ExtractionJobRow[];
}
