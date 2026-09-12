import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for `catalog_queries`, `catalog_products` and `job_budgets`
 * (migration 045). No business logic and no auth checks: the scrape job runs
 * with no session and the search endpoint is public, so everything here uses
 * the service-role client.
 *
 * Errors are NOT swallowed — a missing relation must reach the service so
 * `isSchemaMissingError` can fail the run loudly instead of reporting a
 * cheerful zero. Message text is preserved verbatim for the classifier.
 */

// ── Row types ───────────────────────────────────────────────────────────────

export type CatalogStore = "amazon" | "ebay";

export interface CatalogQueryRow {
  id: string;
  store: CatalogStore;
  category: string;
  query: string;
  priority: number;
  is_active: boolean;
  source: "seed" | "admin";
  last_run_at: string | null;
  last_result_count: number | null;
  consecutive_failures: number;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogProductInput {
  store: CatalogStore;
  external_id: string | null;
  product_url: string;
  url_hash: string;
  title: string;
  image_url: string | null;
  price_usd: number | null;
  currency: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  query_id: string | null;
  raw: Record<string, unknown> | null;
}

export interface CatalogSearchHit {
  id: string;
  store: CatalogStore;
  external_id: string | null;
  product_url: string;
  title: string;
  image_url: string | null;
  price_usd: number | null;
  currency: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  last_seen_at: string;
  rank: number;
}

export interface JobBudgetRow {
  job: string;
  period: string;
  used: number;
  cap: number;
  updated_at: string;
}

// ── catalog_queries ─────────────────────────────────────────────────────────

/**
 * Claim the next due query. The Postgres function stamps `last_run_at` and
 * `next_run_at` in the same statement (`for update skip locked`) so two
 * overlapping runs never take the same row. Null when nothing is due.
 */
export async function claimNextDueQuery(nowIso: string, requeryAfterHours: number): Promise<CatalogQueryRow | null> {
  const client = createAdminClient();
  const { data, error } = await client.rpc("claim_next_catalog_query", {
    p_now: nowIso,
    p_requery_hours: requeryAfterHours,
  });

  if (error) throw new Error(`Failed to claim catalog query: ${error.message}`);
  const rows = (data ?? []) as unknown as CatalogQueryRow[];
  return rows[0] ?? null;
}

/** Record the outcome of a run: result count on success, failure streak + pause switch otherwise. */
export async function markQueryResult(
  queryId: string,
  input: { last_result_count: number | null; consecutive_failures: number; is_active: boolean },
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("catalog_queries")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", queryId);

  if (error) throw new Error(`Failed to record catalog query result: ${error.message}`);
}

// ── catalog_products ────────────────────────────────────────────────────────

/**
 * Insert-or-refresh by `url_hash`. On conflict the listing's mutable facts
 * (price, title, image, rating, last_seen_at) are overwritten; `first_seen_at`
 * and `created_at` are not in the payload so they keep their insert values.
 * Rows must already be unique on url_hash — Postgres rejects a batch that
 * touches the same row twice. Returns the number of rows written.
 */
export async function upsertCatalogProducts(rows: readonly CatalogProductInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const client = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("catalog_products")
    .upsert(
      rows.map((r) => ({ ...r, last_seen_at: now, updated_at: now })),
      { onConflict: "url_hash" },
    )
    .select("id");

  if (error) throw new Error(`Failed to upsert catalog products: ${error.message}`);
  return data?.length ?? 0;
}

/** Ranked text search (websearch tsquery + trigram fallback) via `search_catalog_products`. */
export async function searchCatalogProducts(input: { q: string; limit: number }): Promise<CatalogSearchHit[]> {
  const client = createAdminClient();
  const { data, error } = await client.rpc("search_catalog_products", {
    p_q: input.q,
    p_limit: input.limit,
  });

  if (error) throw new Error(`Failed to search catalog: ${error.message}`);
  return (data ?? []) as unknown as CatalogSearchHit[];
}

// ── job_budgets ─────────────────────────────────────────────────────────────

/** Read the period's budget row, creating it with `defaultCap` on first use. */
export async function getOrCreateBudget(job: string, period: string, defaultCap: number): Promise<JobBudgetRow> {
  const client = createAdminClient();
  const { error: insertError } = await client
    .from("job_budgets")
    .upsert({ job, period, used: 0, cap: defaultCap }, { onConflict: "job,period", ignoreDuplicates: true });
  if (insertError) throw new Error(`Failed to create job budget: ${insertError.message}`);

  const { data, error } = await client
    .from("job_budgets")
    .select("job, period, used, cap, updated_at")
    .eq("job", job)
    .eq("period", period)
    .single();

  if (error) throw new Error(`Failed to load job budget: ${error.message}`);
  return data as unknown as JobBudgetRow;
}

/** Atomic `used += n` via `increment_job_budget`; returns the updated row. */
export async function incrementBudget(job: string, period: string, n: number, defaultCap: number): Promise<JobBudgetRow> {
  const client = createAdminClient();
  const { data, error } = await client.rpc("increment_job_budget", {
    p_job: job,
    p_period: period,
    p_n: n,
    p_default_cap: defaultCap,
  });

  if (error) throw new Error(`Failed to increment job budget: ${error.message}`);
  return data as unknown as JobBudgetRow;
}
