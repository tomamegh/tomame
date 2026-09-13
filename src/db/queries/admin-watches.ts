import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for the price-watch admin screen — `price_watches`,
 * `price_observations` (041/042), the price-drop columns (052) and the
 * `job_budgets` ceiling (045).
 *
 * WHY NOT `price-watches.ts`. That file is the CUSTOMER'S view: every read in it
 * is scoped to one `user_id` because that is what the account screen and the
 * nightly job need. The admin question is the opposite one — "is the job
 * working at all, and for whom is it not" — which is a cross-customer read and
 * has no business being bolted onto a per-user query file.
 *
 * Service-role throughout, so the caller must already have checked that it is
 * talking to an admin. `db/queries` holds no auth checks (CLAUDE.md).
 */

// ── Rows ─────────────────────────────────────────────────────────────────────

/** One watch as the admin table renders it, with its owner's profile inlined. */
export interface AdminWatchRow {
  id: string;
  user_id: string;
  product_url: string;
  product_name: string | null;
  last_price_usd: number | null;
  last_total_ghs: number | null;
  last_checked_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  notify_on_drop: boolean;
  notified_at: string | null;
  notified_price_usd: number | null;
  is_active: boolean;
  created_at: string;
  /**
   * The owner's name, or null when the profile row has gone.
   *
   * NO EMAIL. `profiles` has no email column — the address lives in
   * `auth.users` and is only reachable through the admin auth API, one call per
   * user. A table of fifty watches is not worth fifty auth round trips, so the
   * row links to `/admin/users/<id>` where the address is already loaded.
   */
  owner: { id: string; first_name: string | null; last_name: string | null } | null;
}

const WATCH_COLUMNS =
  "id, user_id, product_url, product_name, last_price_usd, last_total_ghs, last_checked_at, " +
  "consecutive_failures, last_error, notify_on_drop, notified_at, notified_price_usd, " +
  "is_active, created_at";

type WatchQueryRow = Omit<AdminWatchRow, "owner"> & {
  profiles: { id: string; first_name: string | null; last_name: string | null } | null;
};

/**
 * Watches the admin should look at, most recently touched first.
 *
 * ORDERED BY `updated_at`, not `created_at`: the interesting rows are the ones
 * the job has just succeeded or failed on, not the ones a customer created
 * longest ago. Capped, because this screen is a health check and not an export.
 */
export async function listWatchesForAdmin(limit = 100): Promise<AdminWatchRow[]> {
  const { data, error } = await createAdminClient()
    .from("price_watches")
    .select(`${WATCH_COLUMNS}, profiles(id, first_name, last_name)`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load price watches: ${error.message}`);

  return ((data ?? []) as unknown as WatchQueryRow[]).map(({ profiles, ...row }) => ({
    ...row,
    owner: profiles ?? null,
  }));
}

/**
 * The watches the job is currently getting wrong: still active but with
 * failures behind them, worst first. These are the ones heading for retirement
 * at `PRICE_WATCH_JOB.maxConsecutiveFailures`, and the only warning an admin
 * gets before a customer's watch goes quiet.
 */
export async function listFailingWatches(limit = 25): Promise<AdminWatchRow[]> {
  const { data, error } = await createAdminClient()
    .from("price_watches")
    .select(`${WATCH_COLUMNS}, profiles(id, first_name, last_name)`)
    .gt("consecutive_failures", 0)
    .order("consecutive_failures", { ascending: false })
    .order("last_checked_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load failing price watches: ${error.message}`);

  return ((data ?? []) as unknown as WatchQueryRow[]).map(({ profiles, ...row }) => ({
    ...row,
    owner: profiles ?? null,
  }));
}

// ── Counts ───────────────────────────────────────────────────────────────────

export interface AdminWatchCounts {
  /** Being checked by the job. */
  active: number;
  /** Active, but the last check (or several) failed. */
  failing: number;
  /** Job gave up: inactive WITH failures behind it. */
  retired: number;
  /** Inactive with no failures — the customer removed or paused it. */
  pausedByCustomer: number;
  /** Active and never yet checked: new, or the job is not running. */
  neverChecked: number;
  /** Active watches checked within the last 24 hours. */
  checkedLast24h: number;
  /** Price observations appended in the last 7 days — one per SUCCESSFUL check. */
  observationsLast7d: number;
  /** `notifications` rows with event `price_drop` in the last 7 days. */
  alertsLast7d: number;
}

export async function getAdminWatchCounts(now: Date = new Date()): Promise<AdminWatchCounts> {
  const db = createAdminClient();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const count = async (
    build: (db: ReturnType<typeof createAdminClient>) => PromiseLike<{
      count: number | null;
      error: { message: string } | null;
    }>,
    what: string,
  ): Promise<number> => {
    const { count: n, error } = await build(db);
    if (error) throw new Error(`Failed to count ${what}: ${error.message}`);
    return n ?? 0;
  };

  const [
    active,
    failing,
    retired,
    pausedByCustomer,
    neverChecked,
    checkedLast24h,
    observationsLast7d,
    alertsLast7d,
  ] = await Promise.all([
    count((c) => c.from("price_watches").select("id", { count: "exact", head: true }).eq("is_active", true), "active watches"),
    count((c) => c.from("price_watches").select("id", { count: "exact", head: true }).eq("is_active", true).gt("consecutive_failures", 0), "failing watches"),
    count((c) => c.from("price_watches").select("id", { count: "exact", head: true }).eq("is_active", false).gt("consecutive_failures", 0), "retired watches"),
    count((c) => c.from("price_watches").select("id", { count: "exact", head: true }).eq("is_active", false).eq("consecutive_failures", 0), "paused watches"),
    count((c) => c.from("price_watches").select("id", { count: "exact", head: true }).eq("is_active", true).is("last_checked_at", null), "unchecked watches"),
    count((c) => c.from("price_watches").select("id", { count: "exact", head: true }).eq("is_active", true).gt("last_checked_at", dayAgo), "recently checked watches"),
    count((c) => c.from("price_observations").select("id", { count: "exact", head: true }).gt("observed_at", weekAgo), "price observations"),
    count((c) => c.from("notifications").select("id", { count: "exact", head: true }).eq("event", "price_drop").gt("created_at", weekAgo), "price-drop alerts"),
  ]);

  return {
    active,
    failing,
    retired,
    pausedByCustomer,
    neverChecked,
    checkedLast24h,
    observationsLast7d,
    alertsLast7d,
  };
}

// ── Alerts actually sent ─────────────────────────────────────────────────────

export interface AdminPriceDropAlertRow {
  id: string;
  user_id: string;
  status: "pending" | "sent" | "failed";
  created_at: string;
  sent_at: string | null;
  payload: Record<string, unknown>;
}

/**
 * The price-drop mail itself, newest first.
 *
 * `price_watches.notified_at` records that the job DECIDED to alert; this
 * records whether the message landed. They are different facts and an admin
 * needs both — a watch stamped `notified_at` whose notification row says
 * `failed` is a customer who was never actually told.
 */
export async function listPriceDropAlerts(limit = 20): Promise<AdminPriceDropAlertRow[]> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .select("id, user_id, status, created_at, sent_at, payload")
    .eq("event", "price_drop")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load price-drop alerts: ${error.message}`);
  return (data ?? []) as unknown as AdminPriceDropAlertRow[];
}

// ── Vendor spend ─────────────────────────────────────────────────────────────

export interface JobBudgetRow {
  job: string;
  /** 'YYYY-MM' (UTC). */
  period: string;
  used: number;
  cap: number;
}

/**
 * This month's metered vendor spend, per job.
 *
 * IMPORTANT, and the reason this screen says so out loud: only
 * `catalog-scrape` writes to `job_budgets` today (migration 045). The
 * price-watch job runs a full extraction per check and records NOTHING here, so
 * an absent `price-watch` row is not a zero — it means that job is unmetered.
 * The watch screen therefore reports checks performed, which is a real count,
 * and states that they are unmetered rather than printing a reassuring 0.
 */
export async function listJobBudgets(period: string): Promise<JobBudgetRow[]> {
  const { data, error } = await createAdminClient()
    .from("job_budgets")
    .select("job, period, used, cap")
    .eq("period", period)
    .order("job");

  if (error) throw new Error(`Failed to load job budgets: ${error.message}`);
  return (data ?? []) as unknown as JobBudgetRow[];
}

/** The `YYYY-MM` key `job_budgets` is partitioned by. UTC, as the job writes it. */
export function budgetPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
