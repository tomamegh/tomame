import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for `price_watches` and `price_observations` (migration 041).
 *
 * No business logic and no auth checks live here — every function that touches
 * a customer's rows takes an explicit `userId` that the SERVICE has already
 * resolved from the session. The service-role client is used throughout for two
 * reasons: `price_observations` has no write policy at all (only the nightly
 * cron may append to a price series), and the nightly job runs with no session.
 *
 * Errors are NOT swallowed. A missing relation must reach the service so
 * `isSchemaMissingError` can fail the request loudly instead of rendering an
 * empty watch list on an un-migrated database. PostgREST's structured `code` is
 * lost in the rethrow, so the message text is preserved verbatim — that is what
 * the classifier matches on.
 */

// ── Row types ───────────────────────────────────────────────────────────────

export interface PriceWatchRow {
  id: string;
  user_id: string;
  product_url: string;
  url_hash: string;
  product_name: string | null;
  product_image_url: string | null;
  extraction_cache_id: string | null;
  baseline_price_usd: number | null;
  baseline_total_ghs: number | null;
  last_price_usd: number | null;
  last_total_ghs: number | null;
  last_checked_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  notify_on_drop: boolean;
  /** When a price-drop alert last went out for this watch. NULL = never (052). */
  notified_at: string | null;
  /**
   * The USD price that alert quoted. The re-notification rule compares against
   * THIS, not the baseline — see `price-drop.service.ts`.
   */
  notified_price_usd: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceObservationRow {
  id: string;
  watch_id: string;
  price_usd: number;
  total_ghs: number;
  exchange_rate: number;
  observed_at: string;
}

export interface PriceWatchInsert {
  user_id: string;
  product_url: string;
  url_hash: string;
  product_name: string | null;
  product_image_url: string | null;
  extraction_cache_id: string | null;
  baseline_price_usd: number;
  baseline_total_ghs: number;
  last_price_usd: number;
  last_total_ghs: number;
  last_checked_at: string;
}

export interface PriceObservationInsert {
  watch_id: string;
  price_usd: number;
  total_ghs: number;
  exchange_rate: number;
}

const WATCH_COLUMNS =
  "id, user_id, product_url, url_hash, product_name, product_image_url, extraction_cache_id, " +
  "baseline_price_usd, baseline_total_ghs, last_price_usd, last_total_ghs, last_checked_at, " +
  "consecutive_failures, last_error, notify_on_drop, notified_at, notified_price_usd, " +
  "is_active, created_at, updated_at";

const OBSERVATION_COLUMNS = "id, watch_id, price_usd, total_ghs, exchange_rate, observed_at";

// ── price_watches ───────────────────────────────────────────────────────────

/** One customer's active watches, newest first. Serves `idx_price_watches_user`. */
export async function listActiveWatchesByUser(userId: string): Promise<PriceWatchRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_watches")
    .select(WATCH_COLUMNS)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load price watches: ${error.message}`);
  return (data ?? []) as unknown as PriceWatchRow[];
}

/**
 * The watches the nightly job gave up on — `is_active = false` with failures
 * behind it.
 *
 * These must be readable somewhere. `is_active` carries two very different
 * meanings (a customer pausing a watch, and the job retiring one after
 * `maxConsecutiveFailures`), and every other query filters them out, so without
 * this a watch that stopped being checked simply disappears and the customer
 * goes on believing it is running.
 *
 * `consecutive_failures > 0` is what separates the two: a watch the customer
 * paused has no failures behind it.
 */
export async function listRetiredWatchesByUser(userId: string): Promise<PriceWatchRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_watches")
    .select(WATCH_COLUMNS)
    .eq("user_id", userId)
    .eq("is_active", false)
    .gt("consecutive_failures", 0)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to load retired price watches: ${error.message}`);
  return (data ?? []) as unknown as PriceWatchRow[];
}

/**
 * A single watch by id, WITHOUT an ownership filter. The caller compares
 * `user_id` itself so it can answer 404 rather than 403 — a 403 would confirm
 * that somebody else's watch id exists.
 */
export async function getWatchById(watchId: string): Promise<PriceWatchRow | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_watches")
    .select(WATCH_COLUMNS)
    .eq("id", watchId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load price watch: ${error.message}`);
  return (data as unknown as PriceWatchRow) ?? null;
}

/** Resolves the `UNIQUE (user_id, url_hash)` pair so the service can be idempotent. */
export async function getWatchByUserAndHash(userId: string, urlHash: string): Promise<PriceWatchRow | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_watches")
    .select(WATCH_COLUMNS)
    .eq("user_id", userId)
    .eq("url_hash", urlHash)
    .maybeSingle();

  if (error) throw new Error(`Failed to load price watch: ${error.message}`);
  return (data as unknown as PriceWatchRow) ?? null;
}

export async function insertPriceWatch(input: PriceWatchInsert): Promise<PriceWatchRow> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_watches")
    .insert(input)
    .select(WATCH_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create price watch: ${error?.message ?? "no row returned"}`);
  }
  return data as unknown as PriceWatchRow;
}

/**
 * Re-arm a watch the customer had removed (or the job had retired) without
 * violating `UNIQUE (user_id, url_hash)`. Baselines are rewritten because the
 * "since you started watching" delta restarts with the new baseline.
 *
 * The notification reference is cleared with them (052). A watch re-armed today
 * at today's price has told the customer nothing yet, and leaving a stale
 * `notified_price_usd` from the previous life of the row would measure the next
 * alert against a price from before the gap — silencing a real drop, or
 * announcing one that already happened.
 */
export async function reactivatePriceWatch(
  watchId: string,
  input: Omit<PriceWatchInsert, "user_id" | "url_hash">,
): Promise<PriceWatchRow> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_watches")
    .update({
      ...input,
      is_active: true,
      consecutive_failures: 0,
      last_error: null,
      notified_at: null,
      notified_price_usd: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", watchId)
    .select(WATCH_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to reactivate price watch: ${error?.message ?? "no row returned"}`);
  }
  return data as unknown as PriceWatchRow;
}

/** Hard delete. Cascades to `price_observations` by FK. */
export async function deletePriceWatch(watchId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("price_watches").delete().eq("id", watchId);
  if (error) throw new Error(`Failed to delete price watch: ${error.message}`);
}

/**
 * The batch job's claim query: least-recently-checked active watches first, so
 * a per-batch cap lengthens the cycle rather than starving anyone. NULLS FIRST
 * (new watches) is the index's own ordering — `idx_price_watches_due`.
 *
 * `dueBefore` is what makes a 10-minute schedule safe (migration 052). Without
 * it a small batch fired often would re-check the same head of the queue every
 * few minutes and burn scraper credit on prices that have not moved; with it a
 * watch checked inside the window is simply not returned, so once everybody has
 * had their turn the runs claim nothing. Passing null keeps the old
 * "everything active, oldest first" behaviour for callers that want it.
 */
export async function listWatchesDueForCheck(
  limit: number,
  dueBefore: string | null = null,
): Promise<PriceWatchRow[]> {
  const client = createAdminClient();
  let query = client
    .from("price_watches")
    .select(WATCH_COLUMNS)
    .eq("is_active", true);

  // A never-checked watch has no `last_checked_at` to compare, and it is the
  // one most deserving of a turn — `is.null` must stay in the OR.
  if (dueBefore) {
    query = query.or(`last_checked_at.is.null,last_checked_at.lt.${dueBefore}`);
  }

  const { data, error } = await query
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load due price watches: ${error.message}`);
  return (data ?? []) as unknown as PriceWatchRow[];
}

/** Record a successful re-check: new last_*, and the failure counter cleared. */
export async function markWatchChecked(
  watchId: string,
  input: {
    last_price_usd: number;
    last_total_ghs: number;
    extraction_cache_id: string | null;
    product_name: string | null;
    product_image_url: string | null;
    checked_at: string;
  },
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("price_watches")
    .update({
      last_price_usd: input.last_price_usd,
      last_total_ghs: input.last_total_ghs,
      extraction_cache_id: input.extraction_cache_id,
      product_name: input.product_name,
      product_image_url: input.product_image_url,
      last_checked_at: input.checked_at,
      consecutive_failures: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", watchId);

  if (error) throw new Error(`Failed to update price watch: ${error.message}`);
}

/**
 * Record a failed re-check. `last_checked_at` is stamped even on failure —
 * otherwise a permanently broken URL stays at the head of the due queue and
 * every run spends its whole budget on the same dead links.
 */
export async function markWatchFailed(
  watchId: string,
  input: { consecutive_failures: number; last_error: string; is_active: boolean; checked_at: string },
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("price_watches")
    .update({
      consecutive_failures: input.consecutive_failures,
      last_error: input.last_error.slice(0, 500),
      is_active: input.is_active,
      last_checked_at: input.checked_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", watchId);

  if (error) throw new Error(`Failed to record price watch failure: ${error.message}`);
}

/**
 * Move the watch's notification reference point after an alert has been
 * decided (migration 052).
 *
 * This write is what stops a price that simply STAYS low from emailing the
 * customer on every run: the next alert is measured against
 * `notified_price_usd`, so the price has to fall by the threshold again, from
 * the level the customer already knows about. It is deliberately separate from
 * `markWatchChecked` — a re-check happens every run, a notification almost
 * never does, and folding them together would make it far too easy to move
 * this reference point by accident.
 */
export async function markWatchNotified(
  watchId: string,
  input: { notified_price_usd: number; notified_at: string },
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("price_watches")
    .update({
      notified_price_usd: input.notified_price_usd,
      notified_at: input.notified_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", watchId);

  if (error) throw new Error(`Failed to record price watch notification: ${error.message}`);
}

// ── price_observations ──────────────────────────────────────────────────────

/** Append one immutable observation. Service-role only by design (migration 041). */
export async function insertPriceObservation(input: PriceObservationInsert): Promise<PriceObservationRow> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_observations")
    .insert(input)
    .select(OBSERVATION_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to record price observation: ${error?.message ?? "no row returned"}`);
  }
  return data as unknown as PriceObservationRow;
}

/** One watch's series since `since` (ISO), oldest first — the order stats want. */
export async function listObservationsForWatch(watchId: string, since: string): Promise<PriceObservationRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_observations")
    .select(OBSERVATION_COLUMNS)
    .eq("watch_id", watchId)
    .gte("observed_at", since)
    .order("observed_at", { ascending: true });

  if (error) throw new Error(`Failed to load price observations: ${error.message}`);
  return (data ?? []) as unknown as PriceObservationRow[];
}

/**
 * Series for several watches in one round trip — the list endpoint derives
 * stats for every card, and N+1 queries on a page-load path is not acceptable.
 */
export async function listObservationsForWatches(
  watchIds: string[],
  since: string,
): Promise<PriceObservationRow[]> {
  if (watchIds.length === 0) return [];
  const client = createAdminClient();
  const { data, error } = await client
    .from("price_observations")
    .select(OBSERVATION_COLUMNS)
    .in("watch_id", watchIds)
    .gte("observed_at", since)
    .order("observed_at", { ascending: true });

  if (error) throw new Error(`Failed to load price observations: ${error.message}`);
  return (data ?? []) as unknown as PriceObservationRow[];
}
