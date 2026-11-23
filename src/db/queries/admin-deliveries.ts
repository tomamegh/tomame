import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { Order } from "@/features/orders/types";
import type { OrderDelivery } from "@/features/deliveries/types";

/**
 * The delivery pipeline, read for the admin console.
 *
 * A "delivery" is an order past payment: `processing`, `in_transit`,
 * `delivered` or `completed`. The facts live in two tables and the screen must
 * not pretend otherwise — `orders` carries the status, the carrier, the tracking
 * number and the ETA window, and `order_deliveries` (017) carries the tracking
 * URL, the operator's notes and its own lifecycle status.
 *
 * MANY ORDERS HAVE NO `order_deliveries` ROW, and that is not a bug in this
 * query. `upsertOrderDelivery` has always upserted `onConflict: "order_id"`,
 * but 017 gave that column only a plain index; Postgres requires a UNIQUE one
 * for ON CONFLICT, so every write failed and was swallowed by a log line until
 * migration 050 added the index. Orders that shipped before 050 therefore have
 * a carrier on the order and nothing in this table. The row is returned as null
 * and the screen says "not recorded" rather than filling the gap in.
 */

export const DELIVERY_PIPELINE_STATUSES = [
  "processing",
  "in_transit",
  "delivered",
  "completed",
] as const;

export type DeliveryPipelineStatus = (typeof DELIVERY_PIPELINE_STATUSES)[number];

export interface AdminDeliveryRow {
  order: Order;
  /** The 017 row, when one was ever written. See the module comment. */
  record: OrderDelivery | null;
  customer_name: string | null;
  /** The zone the group was checked out to, named — not its id. */
  zone_name: string | null;
  zone_kind: "door" | "pickup" | null;
  /** 113 (Fix 12): the Accra leg, from the package the order flew in: its air waybill, or why there is none. */
  accra_leg: AccraLeg | null;
}

export interface AccraLeg {
  package_reference: string;
  carrier: string | null;
  awb: string | null;
  no_tracking_reason: string | null;
  shipped: boolean;
}

export interface AdminDeliveryFilters {
  status?: string;
  originCountry?: string;
  limit?: number;
}

export const ADMIN_DELIVERIES_PAGE_SIZE = 100;

export async function listAdminDeliveries(
  filters: AdminDeliveryFilters = {},
): Promise<AdminDeliveryRow[]> {
  const db = createAdminClient();

  const statuses = isPipelineStatus(filters.status)
    ? [filters.status]
    : [...DELIVERY_PIPELINE_STATUSES];

  let query = db
    .from("orders")
    .select("*")
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? ADMIN_DELIVERIES_PAGE_SIZE);

  if (filters.originCountry) query = query.eq("origin_country", filters.originCountry);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load deliveries: ${error.message}`);

  const orders = (data ?? []) as Order[];
  if (orders.length === 0) return [];

  const [records, names, zones, legs] = await Promise.all([
    listDeliveryRecords(orders.map((order) => order.id)),
    listCustomerNames(orders.map((order) => order.user_id)),
    listZonesForOrders(orders),
    listAccraLegs(orders.map((order) => order.id)),
  ]);

  return orders.map((order) => ({
    order,
    record: records.get(order.id) ?? null,
    customer_name: names.get(order.user_id) ?? null,
    zone_name: zones.get(order.id)?.name ?? null,
    zone_kind: zones.get(order.id)?.kind ?? null,
    accra_leg: legs.get(order.id) ?? null,
  }));
}

/** The package each order is in, with its air waybill (113). The warehouse ship path keeps it there, not on the order. */
async function listAccraLegs(orderIds: string[]): Promise<Map<string, AccraLeg>> {
  const legs = new Map<string, AccraLeg>();
  if (orderIds.length === 0) return legs;
  const db = createAdminClient();
  const { data: items, error } = await db.from("warehouse_package_items").select("order_id, package_id").in("order_id", orderIds);
  if (error) {
    logger.warn("delivery package lookup failed", { message: error.message });
    return legs;
  }
  const rows = (items ?? []) as { order_id: string | null; package_id: string }[];
  const packageIds = [...new Set(rows.map((r) => r.package_id))];
  if (packageIds.length === 0) return legs;
  const { data: packages, error: pkgError } = await db
    .from("warehouse_packages")
    .select("id, reference, status, carrier, tracking_number, no_tracking_reason")
    .in("id", packageIds);
  if (pkgError) {
    logger.warn("delivery packages failed", { message: pkgError.message });
    return legs;
  }
  const byId = new Map(
    ((packages ?? []) as { id: string; reference: string; status: string; carrier: string | null; tracking_number: string | null; no_tracking_reason: string | null }[]).map((p) => [p.id, p]),
  );
  for (const row of rows) {
    const pkg = byId.get(row.package_id);
    if (!row.order_id || !pkg) continue;
    legs.set(row.order_id, {
      package_reference: pkg.reference,
      carrier: pkg.carrier,
      awb: pkg.tracking_number,
      no_tracking_reason: pkg.no_tracking_reason,
      shipped: pkg.status === "shipped",
    });
  }
  return legs;
}

/** How many orders sit at each stop of the pipeline. Counted in the database. */
export type DeliveryPipelineCounts = Record<DeliveryPipelineStatus, number> & {
  /** In the pipeline and carrying no tracking number at all. */
  untracked: number;
};

export async function getDeliveryPipelineCounts(): Promise<DeliveryPipelineCounts> {
  const db = createAdminClient();

  const counts = await Promise.all(
    DELIVERY_PIPELINE_STATUSES.map(async (status) => {
      const { count, error } = await db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) {
        logger.warn("delivery pipeline count failed", { status, message: error.message });
        return [status, 0] as const;
      }
      return [status, count ?? 0] as const;
    }),
  );

  const { count: untracked, error } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_transit")
    .is("tracking_number", null);

  if (error) {
    logger.warn("untracked delivery count failed", { message: error.message });
  }

  return {
    ...(Object.fromEntries(counts) as Record<DeliveryPipelineStatus, number>),
    untracked: untracked ?? 0,
  };
}

/** One order's 017 row, for the detail screen. Null when none was ever written. */
export async function getDeliveryRecord(orderId: string): Promise<OrderDelivery | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("order_deliveries")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the delivery record: ${error.message}`);
  return (data as OrderDelivery | null) ?? null;
}

// ── Fan-out reads ───────────────────────────────────────────────────────────

async function listDeliveryRecords(orderIds: string[]): Promise<Map<string, OrderDelivery>> {
  const records = new Map<string, OrderDelivery>();
  if (orderIds.length === 0) return records;

  const db = createAdminClient();
  const { data, error } = await db.from("order_deliveries").select("*").in("order_id", orderIds);
  if (error) throw new Error(`Failed to load delivery records: ${error.message}`);

  for (const row of (data ?? []) as OrderDelivery[]) records.set(row.order_id, row);
  return records;
}

async function listCustomerNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return names;

  const db = createAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", unique);

  if (error) {
    logger.warn("delivery customer names failed", { message: error.message });
    return names;
  }

  for (const row of (data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[]) {
    const name = [row.first_name, row.last_name]
      .filter((part): part is string => !!part?.trim())
      .join(" ")
      .trim();
    if (name) names.set(row.id, name);
  }
  return names;
}

interface ZoneFacts {
  name: string;
  kind: "door" | "pickup";
}

/**
 * The delivery zone each order is going to, by way of its checkout group (048).
 *
 * An order placed before the bag existed has no group and therefore no zone; it
 * is simply absent from the map and the screen shows nothing rather than
 * guessing "Accra".
 */
async function listZonesForOrders(orders: readonly Order[]): Promise<Map<string, ZoneFacts>> {
  const byOrder = new Map<string, ZoneFacts>();
  const groupIds = [
    ...new Set(orders.map((order) => order.order_group_id).filter((id): id is string => !!id)),
  ];
  if (groupIds.length === 0) return byOrder;

  const db = createAdminClient();
  const { data: groups, error: groupError } = await db
    .from("order_groups")
    .select("id, delivery_zone_id")
    .in("id", groupIds);

  if (groupError) {
    logger.warn("delivery zone group read failed", { message: groupError.message });
    return byOrder;
  }

  const zoneByGroup = new Map(
    ((groups ?? []) as { id: string; delivery_zone_id: string | null }[]).map((row) => [
      row.id,
      row.delivery_zone_id,
    ]),
  );
  const zoneIds = [...new Set([...zoneByGroup.values()].filter((id): id is string => !!id))];
  if (zoneIds.length === 0) return byOrder;

  const { data: zones, error: zoneError } = await db
    .from("delivery_zones")
    .select("id, name, kind")
    .in("id", zoneIds);

  if (zoneError) {
    logger.warn("delivery zone read failed", { message: zoneError.message });
    return byOrder;
  }

  const zoneById = new Map(
    ((zones ?? []) as { id: string; name: string; kind: "door" | "pickup" }[]).map((row) => [
      row.id,
      { name: row.name, kind: row.kind },
    ]),
  );

  for (const order of orders) {
    const zoneId = order.order_group_id ? zoneByGroup.get(order.order_group_id) : null;
    const zone = zoneId ? zoneById.get(zoneId) : undefined;
    if (zone) byOrder.set(order.id, zone);
  }
  return byOrder;
}

function isPipelineStatus(value: string | undefined): value is DeliveryPipelineStatus {
  return (
    !!value && (DELIVERY_PIPELINE_STATUSES as readonly string[]).includes(value)
  );
}
