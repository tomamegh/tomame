import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for the warehouse's activity trail and the admin's insights on it
 * (082).
 *
 * Service role throughout: `warehouse_activity` has no `authenticated` grant at
 * all, and the three functions are executable by the service role only. Who may
 * write (an operator, about themselves) and who may read (an admin) is decided
 * by the services that call these; nothing here checks a role.
 */

export type WarehouseActivityKind = "page_view" | "scan" | "lookup_failed" | "label_view";

export interface WarehouseActivityInsert {
  actor_id: string;
  actor_role: "admin" | "warehouse";
  kind: WarehouseActivityKind;
  path?: string | null;
  subject_type?: "warehouse_package" | "order" | null;
  subject_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertWarehouseActivity(row: WarehouseActivityInsert): Promise<void> {
  const { error } = await createAdminClient()
    .from("warehouse_activity")
    .insert({
      actor_id: row.actor_id,
      actor_role: row.actor_role,
      kind: row.kind,
      path: row.path ?? null,
      subject_type: row.subject_type ?? null,
      subject_id: row.subject_id ?? null,
      metadata: row.metadata ?? {},
    });
  if (error) throw new Error(`Failed to record warehouse activity: ${error.message}`);
}

// ── The timeline ────────────────────────────────────────────────────────────

/** One row of `warehouse_activity_feed()` — an audit row or an activity row. */
export interface ActivityFeedRow {
  id: string;
  source: "audit" | "activity";
  action: string;
  actor_id: string | null;
  actor_role: string;
  entity_type: string | null;
  entity_id: string | null;
  path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityFeedQuery {
  limit: number;
  before?: { at: string; id: string } | null;
  since?: string | null;
  until?: string | null;
  actorId?: string | null;
  /** NULL: every warehouse audit action. Empty: none. */
  actions?: readonly string[] | null;
  /** NULL: every activity kind. Empty: none. */
  kinds?: readonly string[] | null;
  subjectId?: string | null;
  code?: string | null;
}

export async function listActivityFeed(query: ActivityFeedQuery): Promise<ActivityFeedRow[]> {
  const { data, error } = await createAdminClient().rpc("warehouse_activity_feed", {
    p_limit: query.limit,
    p_before: query.before?.at ?? null,
    p_before_id: query.before?.id ?? null,
    p_since: query.since ?? null,
    p_until: query.until ?? null,
    p_actor: query.actorId ?? null,
    p_actions: query.actions ? [...query.actions] : null,
    p_kinds: query.kinds ? [...query.kinds] : null,
    p_subject: query.subjectId ?? null,
    p_code: query.code ?? null,
  });
  if (error) throw new Error(`Failed to load warehouse activity: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    source: r.source === "activity" ? "activity" : "audit",
    action: r.action as string,
    actor_id: (r.actor_id as string | null) ?? null,
    actor_role: r.actor_role as string,
    entity_type: (r.entity_type as string | null) ?? null,
    entity_id: (r.entity_id as string | null) ?? null,
    path: (r.path as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    created_at: r.created_at as string,
  }));
}

export interface StaffRow {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

/** Every admin and warehouse operator, with the address a nameless one falls back to. */
export async function listWarehouseStaff(): Promise<StaffRow[]> {
  const { data, error } = await createAdminClient().rpc("warehouse_staff");
  if (error) throw new Error(`Failed to load warehouse staff: ${error.message}`);
  return (data ?? []) as StaffRow[];
}

export interface ActivitySummaryRow {
  actor_id: string;
  kind: WarehouseActivityKind;
  events: number;
  last_at: string;
}

export async function summarizeActivitySince(since: string): Promise<ActivitySummaryRow[]> {
  const { data, error } = await createAdminClient().rpc("warehouse_activity_summary", {
    p_since: since,
  });
  if (error) throw new Error(`Failed to summarise warehouse activity: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    actor_id: r.actor_id as string,
    kind: r.kind as WarehouseActivityKind,
    events: Number(r.events),
    last_at: r.last_at as string,
  }));
}

// ── Insights ────────────────────────────────────────────────────────────────

export interface InsightAuditRow {
  action: string;
  actor_id: string | null;
  actor_role: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Ceiling on the rows one insights render reads. 90 days of a busy hub is well under it. */
const INSIGHT_ROW_CAP = 10_000;

/**
 * Warehouse audit rows since `since`, oldest first. The same membership rule as
 * the feed function: a warehouse action, a parcel action, or anything done by an
 * account audited as `warehouse`.
 */
export async function listWarehouseAuditSince(
  since: string,
): Promise<{ rows: InsightAuditRow[]; truncated: boolean }> {
  const { data, error } = await createAdminClient()
    .from("audit_logs")
    .select("action, actor_id, actor_role, entity_id, metadata, created_at")
    .gte("created_at", since)
    .or(
      "action.like.warehouse_*,action.in.(order_held,order_hold_released,order_feedback_updated,order_photo_uploaded,order_photo_deleted),actor_role.eq.warehouse",
    )
    .order("created_at", { ascending: true })
    .limit(INSIGHT_ROW_CAP);
  if (error) throw new Error(`Failed to load warehouse audit rows: ${error.message}`);
  const rows = (data ?? []) as InsightAuditRow[];
  return { rows, truncated: rows.length >= INSIGHT_ROW_CAP };
}

export interface ShippedPackageRow {
  id: string;
  reference: string;
  sealed_at: string | null;
  shipped_at: string;
  order_ids: string[];
}

export async function listPackagesShippedSince(since: string): Promise<ShippedPackageRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("warehouse_packages")
    .select("id, reference, sealed_at, shipped_at")
    .eq("status", "shipped")
    .gte("shipped_at", since)
    .limit(INSIGHT_ROW_CAP);
  if (error) throw new Error(`Failed to load shipped packages: ${error.message}`);
  const packages = data ?? [];
  if (packages.length === 0) return [];

  const { data: items, error: itemError } = await db
    .from("warehouse_package_items")
    .select("package_id, order_id")
    .in("package_id", packages.map((p) => p.id as string))
    .not("order_id", "is", null);
  if (itemError) throw new Error(`Failed to load shipped package items: ${itemError.message}`);
  const byPackage = new Map<string, string[]>();
  for (const item of items ?? []) {
    const list = byPackage.get(item.package_id as string) ?? [];
    list.push(item.order_id as string);
    byPackage.set(item.package_id as string, list);
  }
  return packages.map((p) => ({
    id: p.id as string,
    reference: p.reference as string,
    sealed_at: (p.sealed_at as string | null) ?? null,
    shipped_at: p.shipped_at as string,
    order_ids: byPackage.get(p.id as string) ?? [],
  }));
}

/** The FIRST time each order was logged in at the hub — a re-weigh does not restart the clock. */
export async function listFirstHubArrivals(orderIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (orderIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("order_events")
    .select("order_id, occurred_at")
    .eq("kind", "hub_received")
    .in("order_id", orderIds)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(`Failed to load hub arrivals: ${error.message}`);
  for (const row of data ?? []) {
    const id = row.order_id as string;
    if (!out.has(id)) out.set(id, row.occurred_at as string);
  }
  return out;
}

export async function countPackagesByStatusNow(): Promise<Record<"packing" | "sealed" | "shipped", number>> {
  const db = createAdminClient();
  const statuses = ["packing", "sealed", "shipped"] as const;
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await db
        .from("warehouse_packages")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw new Error(`Failed to count packages: ${error.message}`);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<"packing" | "sealed" | "shipped", number>;
}

export interface HeldOrderRow {
  id: string;
  order_no: string;
  held_at: string;
  hold_reason: string | null;
}

export async function listHeldOrders(): Promise<HeldOrderRow[]> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("id, order_no, held_at, hold_reason")
    .not("held_at", "is", null)
    .order("held_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to load held orders: ${error.message}`);
  return (data ?? []) as HeldOrderRow[];
}

export interface FeedbackIssueRow {
  id: string;
  order_id: string;
  verdict: string;
  status: string;
  created_at: string;
}

/** Customer complaints about parcel photos raised since `since` — "looks right" excluded. */
export async function listCustomerIssuesSince(since: string): Promise<FeedbackIssueRow[]> {
  const { data, error } = await createAdminClient()
    .from("order_feedback")
    .select("id, order_id, verdict, status, created_at")
    .neq("verdict", "looks_right")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to load customer issues: ${error.message}`);
  return (data ?? []) as FeedbackIssueRow[];
}

export async function countOpenCustomerIssues(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("order_feedback")
    .select("id", { count: "exact", head: true })
    .neq("verdict", "looks_right")
    .in("status", ["open", "in_review"]);
  if (error) throw new Error(`Failed to count customer issues: ${error.message}`);
  return count ?? 0;
}

// ── Names for ids ───────────────────────────────────────────────────────────

export async function listOrderNumbers(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await createAdminClient().from("orders").select("id, order_no").in("id", ids);
  if (error) throw new Error(`Failed to load order numbers: ${error.message}`);
  for (const row of data ?? []) out.set(row.id as string, row.order_no as string);
  return out;
}

export async function listPackageReferences(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("warehouse_packages")
    .select("id, reference")
    .in("id", ids);
  if (error) throw new Error(`Failed to load package references: ${error.message}`);
  for (const row of data ?? []) out.set(row.id as string, row.reference as string);
  return out;
}

/** A printed reference → its row id, for the timeline's search box. */
export async function findSubjectIdByCode(code: string): Promise<string | null> {
  const db = createAdminClient();
  const query = code.startsWith("PKG-")
    ? db.from("warehouse_packages").select("id").eq("reference", code)
    : db.from("orders").select("id").eq("order_no", code);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to resolve ${code}: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}
