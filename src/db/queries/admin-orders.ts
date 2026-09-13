import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { ORDER_STATUSES, type OrderStatus } from "@/config/constants";
import type { AuditLog } from "@/features/audit/types";
import type { Order } from "@/features/orders/types";

/**
 * Order reads for the admin console.
 *
 * WHY A SEPARATE FILE FROM `db/queries/orders.ts`. That one serves the
 * CUSTOMER's screens: every function there takes the cookie-bound client so RLS
 * scopes the rows to one person. The admin console is the opposite case — it
 * wants every row, across every customer, under the service role — and mixing
 * the two in one module has historically been how a customer query ends up
 * accidentally running with RLS bypassed.
 *
 * `db/queries/**` is data access only (CLAUDE.md): nothing here decides whether
 * a transition is legal, what a figure means, or who may look. The screens and
 * the services above do that. The one liberty taken is summing already-stored
 * figures for a list row — arithmetic over numbers the pricing engine wrote, not
 * pricing — which is the same liberty `countBagItems` takes in `carts.ts`.
 */

// ── List ────────────────────────────────────────────────────────────────────

/**
 * A row of the orders table, with the customer's name resolved.
 *
 * `select("*")` rather than a column list: the detail screen reads nearly every
 * column of `orders` anyway, the table is one row per order (not a join fan-out),
 * and a narrowed list has drifted out of date twice already — `order_no` and the
 * ETA window both landed on the row without the admin list learning about them.
 */
export interface AdminOrderRow extends Order {
  /** "Kwame Mensah", or null when the profile carries no name at all. */
  customer_name: string | null;
}

export interface AdminOrderFilters {
  /** One `orders.status`. Anything not in `ORDER_STATUSES` is ignored, not guessed at. */
  status?: string;
  /** Only the hand-pricing queue (`needs_review = true`), or only the rest. */
  needsReview?: boolean;
  /** Free text over the order number and the product name. */
  search?: string;
  limit?: number;
}

/** The list is capped: an admin reads the top of a queue, never five thousand rows. */
export const ADMIN_ORDERS_PAGE_SIZE = 100;

export async function listAdminOrders(
  filters: AdminOrderFilters = {},
): Promise<AdminOrderRow[]> {
  const db = createAdminClient();

  let query = db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? ADMIN_ORDERS_PAGE_SIZE);

  if (filters.status && isOrderStatus(filters.status)) {
    query = query.eq("status", filters.status);
  }
  if (filters.needsReview !== undefined) {
    query = query.eq("needs_review", filters.needsReview);
  }

  const search = filters.search?.trim();
  if (search) {
    // `,` and `)` would close the PostgREST `or()` expression early, so a search
    // containing either must not reach the filter verbatim. Stripped rather than
    // escaped: neither character appears in an order number or is worth
    // searching a product title for.
    const safe = search.replace(/[,()*]/g, " ").trim();
    if (safe) query = query.or(`order_no.ilike.%${safe}%,product_name.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load orders: ${error.message}`);

  const orders = (data ?? []) as Order[];
  const names = await resolveCustomerNames(orders.map((order) => order.user_id));

  return orders.map((order) => ({
    ...order,
    customer_name: names.get(order.user_id) ?? null,
  }));
}

/**
 * How many orders sit in each status, plus the hand-pricing queue.
 *
 * Counted in the database with `head: true` — never by pulling the rows and
 * measuring the array, which is what the old client-side stat cards did on every
 * visit to the orders screen.
 */
export interface AdminOrderCounts {
  byStatus: Record<OrderStatus, number>;
  needsReview: number;
  total: number;
}

export async function getAdminOrderCounts(): Promise<AdminOrderCounts> {
  const db = createAdminClient();
  const statuses = Object.values(ORDER_STATUSES);

  const [statusCounts, needsReview, total] = await Promise.all([
    Promise.all(
      statuses.map((status) =>
        countOrders((q) => q.eq("status", status)).then(
          (count) => [status, count] as const,
        ),
      ),
    ),
    countOrders((q) => q.eq("needs_review", true)),
    countOrders((q) => q),
  ]);

  const byStatus = Object.fromEntries(statusCounts) as Record<OrderStatus, number>;
  return { byStatus, needsReview, total };

  async function countOrders(
    refine: (query: OrderCountQuery) => OrderCountQuery,
  ): Promise<number> {
    const base = db.from("orders").select("id", { count: "exact", head: true });
    const { count, error } = await (refine(
      base as unknown as OrderCountQuery,
    ) as unknown as typeof base);
    if (error) {
      // A count feeds a tile on a page whose table has already loaded. Losing one
      // must not take the screen down — it shows as 0, and the log says why.
      logger.warn("admin order count failed", { message: error.message });
      return 0;
    }
    return count ?? 0;
  }
}

type OrderCountQuery = { eq: (column: string, value: unknown) => OrderCountQuery };

// ── One order ───────────────────────────────────────────────────────────────

export async function getAdminOrder(orderId: string): Promise<Order | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw new Error(`Failed to load order: ${error.message}`);
  return (data as Order | null) ?? null;
}

/** The other orders bought by the same payment (048). Empty for a single-order purchase. */
export async function listSiblingOrders(
  groupId: string,
  excludeOrderId: string,
): Promise<Order[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("order_group_id", groupId)
    .neq("id", excludeOrderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load the rest of the bag: ${error.message}`);
  return (data ?? []) as Order[];
}

/** Who the order belongs to. The email lives in `auth.users`, not in `profiles`. */
export interface AdminOrderCustomer {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  created_at: string | null;
}

export async function getOrderCustomer(userId: string): Promise<AdminOrderCustomer | null> {
  const db = createAdminClient();
  const [auth, profile] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db
      .from("profiles")
      .select("id, first_name, last_name, phone, created_at")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const row = profile.data as ProfileNameRow | null;
  if (auth.error && !row) return null;

  return {
    id: userId,
    email: auth.data?.user?.email ?? null,
    name: fullName(row),
    phone: row?.phone ?? null,
    created_at: row?.created_at ?? auth.data?.user?.created_at ?? null,
  };
}

/** The payment row behind an order: the group's (048) or the legacy per-order one. */
export interface AdminPaymentRow {
  id: string;
  reference: string;
  /** Pesewas — GHS × 100, as Paystack was asked for it. */
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  channel: string | null;
  created_at: string | null;
}

export async function getOrderPayment(order: Order): Promise<AdminPaymentRow | null> {
  const db = createAdminClient();
  const columns = "id, reference, amount, currency, status, channel, created_at";

  // `orders.payment_id` is set by `linkOrderToPayment` on the pending → paid
  // flip. Before that — and for a bag, whose payment names the GROUP rather than
  // any one order — the link runs the other way, so both are tried.
  if (order.payment_id) {
    const { data, error } = await db
      .from("payments")
      .select(columns)
      .eq("id", order.payment_id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load the payment: ${error.message}`);
    if (data) return normalizePayment(data);
  }

  if (order.order_group_id) {
    const { data, error } = await db
      .from("payments")
      .select(columns)
      .eq("order_group_id", order.order_group_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load the payment: ${error.message}`);
    if (data) return normalizePayment(data);
  }

  return null;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

interface ProfileNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone?: string | null;
  created_at?: string | null;
}

/**
 * Names for a page of orders in ONE query rather than one per row.
 *
 * A name failure is absorbed: the table renders the order number and the product
 * either way, and an admin looking for an order should not be shown an error
 * page because a profile row is missing.
 */
async function resolveCustomerNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;

  const db = createAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", unique);

  if (error) {
    logger.warn("admin order customer names failed", { message: error.message });
    return names;
  }

  for (const row of (data ?? []) as ProfileNameRow[]) {
    const name = fullName(row);
    if (name) names.set(row.id, name);
  }
  return names;
}

function fullName(row: ProfileNameRow | null | undefined): string | null {
  const name = [row?.first_name, row?.last_name]
    .filter((part): part is string => !!part?.trim())
    .join(" ")
    .trim();
  return name.length > 0 ? name : null;
}

function normalizePayment(row: Record<string, unknown>): AdminPaymentRow {
  return {
    id: String(row.id),
    reference: String(row.reference),
    amount: Number(row.amount),
    currency: String(row.currency ?? "GHS"),
    status: row.status as AdminPaymentRow["status"],
    channel: (row.channel as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

function isOrderStatus(value: string): value is OrderStatus {
  return (Object.values(ORDER_STATUSES) as string[]).includes(value);
}

/**
 * The compliance log for one order, oldest first.
 *
 * `audit_logs` is append-only and admin-read-only under RLS (002), and migration
 * 050 added the `(entity_type, entity_id, created_at)` index this query needs —
 * before it, the detail screen's timeline was a sequential scan of every audit
 * row in the system.
 *
 * Capped: an order that has been poked at a hundred times is a story the screen
 * tells from the top, and an unbounded read on a compliance table is how an
 * admin page becomes a memory incident.
 */
export async function listOrderAuditLogs(
  orderId: string,
  limit = 100,
): Promise<AuditLog[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("audit_logs")
    .select("*")
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    // The log is context, not the screen's subject. Losing it must not stop an
    // admin moving an order along.
    logger.warn("order audit log read failed", { orderId, message: error.message });
    return [];
  }
  return (data ?? []) as AuditLog[];
}
