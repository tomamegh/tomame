import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The reads behind `/admin/ops` — the operations health screen.
 *
 * DATA ACCESS ONLY. Each function returns counts or rows; what a number MEANS
 * (an alarm, a healthy queue) is decided in `features/ops/ops.service.ts`.
 * These throw; the service degrades each panel on its own.
 *
 * Head counts throughout: the screen wants numbers, and it must not pull a
 * table to measure it. The one list here (pending payments) is capped and
 * ordered oldest first, because the OLDEST pending payment is the alarm.
 */

async function count(table: string, apply: (q: CountQuery) => CountQuery): Promise<number> {
  const client = createAdminClient();
  const base = client.from(table).select("id", { count: "exact", head: true }) as unknown as CountQuery;
  const { count: n, error } = await apply(base);
  if (error) throw new Error(`ops count on ${table} failed: ${error.message}`);
  return n ?? 0;
}

/** The slice of PostgREST's builder the counts use, typed loosely on purpose. */
interface CountQuery extends PromiseLike<{ count: number | null; error: { message: string } | null }> {
  eq(column: string, value: unknown): CountQuery;
  in(column: string, values: unknown[]): CountQuery;
  lt(column: string, value: unknown): CountQuery;
  gte(column: string, value: unknown): CountQuery;
  is(column: string, value: null | boolean): CountQuery;
}

// ── Payments ─────────────────────────────────────────────────────────────────

export interface PendingPaymentRow {
  id: string;
  reference: string;
  amount: number;
  user_id: string;
  order_group_id: string | null;
  order_id: string | null;
  created_at: string;
}

export interface PaymentsHealth {
  pending: PendingPaymentRow[];
  pendingTotal: number;
  success24h: number;
  failed24h: number;
  /** Audit rows of `payment_recovered_after_expiry` flagged for refund review, 30 days. */
  refundReviews: { paymentId: string; at: string }[];
  /** Audit action counts over 7 days: how payments have been resolving. */
  resolved7d: { successful: number; failed: number; expired: number; recovered: number };
}

export async function readPaymentsHealth(now: Date): Promise<PaymentsHealth> {
  const client = createAdminClient();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();

  const [pendingRes, pendingTotal, success24h, failed24h, refundRes, successful, failed, expired, recovered] = await Promise.all([
    client
      .from("payments")
      .select("id, reference, amount, user_id, order_group_id, metadata, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
    count("payments", (q) => q.eq("status", "pending")),
    count("payments", (q) => q.eq("status", "success").gte("created_at", dayAgo)),
    count("payments", (q) => q.eq("status", "failed").gte("created_at", dayAgo)),
    client
      .from("audit_logs")
      .select("entity_id, created_at")
      .in("action", ["payment_successful", "payment_recovered_after_expiry"])
      .eq("metadata->>needsRefundReview", "true")
      .gte("created_at", monthAgo)
      .order("created_at", { ascending: false })
      .limit(20),
    count("audit_logs", (q) => q.eq("action", "payment_successful").gte("created_at", weekAgo)),
    count("audit_logs", (q) => q.eq("action", "payment_failed").gte("created_at", weekAgo)),
    count("audit_logs", (q) => q.eq("action", "payment_expired").gte("created_at", weekAgo)),
    count("audit_logs", (q) => q.eq("action", "payment_recovered_after_expiry").gte("created_at", weekAgo)),
  ]);
  if (pendingRes.error) throw new Error(`ops pending payments failed: ${pendingRes.error.message}`);
  if (refundRes.error) throw new Error(`ops refund reviews failed: ${refundRes.error.message}`);

  return {
    pending: ((pendingRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      reference: String(r.reference),
      amount: Number(r.amount),
      user_id: String(r.user_id),
      order_group_id: (r.order_group_id as string | null) ?? null,
      order_id: typeof (r.metadata as Record<string, unknown> | null)?.order_id === "string"
        ? String((r.metadata as Record<string, unknown>).order_id)
        : null,
      created_at: String(r.created_at),
    })),
    pendingTotal,
    success24h,
    failed24h,
    refundReviews: ((refundRes.data ?? []) as { entity_id: string; created_at: string }[]).map((r) => ({
      paymentId: r.entity_id,
      at: r.created_at,
    })),
    resolved7d: { successful, failed, expired, recovered },
  };
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface NotificationsHealth {
  pending: number;
  oldestPendingAt: string | null;
  failed24h: number;
  sent24h: number;
}

export async function readNotificationsHealth(now: Date): Promise<NotificationsHealth> {
  const client = createAdminClient();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [pending, oldest, failed24h, sent24h] = await Promise.all([
    count("notifications", (q) => q.eq("status", "pending")),
    client.from("notifications").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    count("notifications", (q) => q.eq("status", "failed").gte("created_at", dayAgo)),
    count("notifications", (q) => q.eq("status", "sent").gte("created_at", dayAgo)),
  ]);
  if (oldest.error) throw new Error(`ops oldest notification failed: ${oldest.error.message}`);
  return {
    pending,
    oldestPendingAt: (oldest.data as { created_at?: string } | null)?.created_at ?? null,
    failed24h,
    sent24h,
  };
}

// ── Extraction (the paste queue) ─────────────────────────────────────────────

export interface ExtractionHealth {
  ready24h: number;
  failed24h: number;
  pending: number;
  /** `running` with `started_at` older than ten minutes: a job the sweep should have reclaimed. */
  stuckRunning: number;
}

export async function readExtractionHealth(now: Date): Promise<ExtractionHealth> {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const tenMinAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
  const [ready24h, failed24h, pending, stuckRunning] = await Promise.all([
    count("extraction_requests", (q) => q.eq("status", "ready").gte("created_at", dayAgo)),
    count("extraction_requests", (q) => q.eq("status", "failed").gte("created_at", dayAgo)),
    count("extraction_requests", (q) => q.eq("status", "pending")),
    count("extraction_requests", (q) => q.eq("status", "running").lt("started_at", tenMinAgo)),
  ]);
  return { ready24h, failed24h, pending, stuckRunning };
}

// ── Orders waiting on money ──────────────────────────────────────────────────

export interface OrdersHealth {
  pending: number;
  /** Pending for more than a day: the quote lock has lapsed. */
  pendingOver24h: number;
}

export async function readOrdersHealth(now: Date): Promise<OrdersHealth> {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [pending, pendingOver24h] = await Promise.all([
    count("orders", (q) => q.eq("status", "pending")),
    count("orders", (q) => q.eq("status", "pending").lt("created_at", dayAgo)),
  ]);
  return { pending, pendingOver24h };
}

// ── Vendor budgets and the catalogue ─────────────────────────────────────────

export interface JobBudgetRow {
  job: string;
  period: string;
  used: number;
  cap: number;
  updated_at: string;
}

export async function listJobBudgets(period: string): Promise<JobBudgetRow[]> {
  const client = createAdminClient();
  const { data, error } = await client.from("job_budgets").select("*").eq("period", period).order("job");
  if (error) throw new Error(`ops job budgets failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    job: String(r.job),
    period: String(r.period),
    used: Number(r.used),
    cap: Number(r.cap),
    updated_at: String(r.updated_at),
  }));
}

export interface CatalogHealth {
  products: number;
  new24h: number;
  lastSeenAt: string | null;
}

export async function readCatalogHealth(now: Date): Promise<CatalogHealth> {
  const client = createAdminClient();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [products, new24h, last] = await Promise.all([
    count("catalog_products", (q) => q),
    count("catalog_products", (q) => q.gte("first_seen_at", dayAgo)),
    client.from("catalog_products").select("last_seen_at").order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (last.error) throw new Error(`ops catalogue last seen failed: ${last.error.message}`);
  return { products, new24h, lastSeenAt: (last.data as { last_seen_at?: string } | null)?.last_seen_at ?? null };
}
