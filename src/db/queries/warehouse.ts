import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for the packaging platform (081).
 *
 * Service role throughout: `warehouse_packages` and `warehouse_package_items`
 * have no `authenticated` policy at all, and the orders read here belong to
 * every customer. The caller's role is checked by the route and the service;
 * nothing here decides who may see what.
 *
 * Rows come back raw. `features/warehouse/services` is what turns them into the
 * DTOs the browser sees, and is the only place a column is allowed to leave —
 * `pricing` is read here for its weight and never forwarded.
 */

export type PackageStatus = "packing" | "sealed" | "shipped";
export type PackageService = "air" | "sea";

export interface PackageRow {
  id: string;
  package_no: number;
  reference: string;
  status: PackageStatus;
  service: PackageService;
  origin: string;
  destination: string;
  weight_lbs: number | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  carrier: string | null;
  tracking_number: string | null;
  fragile: boolean;
  this_way_up: boolean;
  keep_dry: boolean;
  notes: string | null;
  created_by: string | null;
  sealed_at: string | null;
  sealed_by: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  label_printed_at: string | null;
  label_print_count: number;
  created_at: string;
  updated_at: string;
}

export interface PackageItemRow {
  id: string;
  package_id: string;
  order_id: string | null;
  description: string | null;
  quantity: number;
  added_by: string | null;
  created_at: string;
}

/** An order as the warehouse reads it. `pricing` is here for its weight only. */
export interface WarehouseOrderRow {
  id: string;
  order_no: string;
  user_id: string;
  status: string;
  product_name: string | null;
  product_url: string | null;
  product_image_url: string | null;
  quantity: number;
  special_instructions: string | null;
  pricing: Record<string, unknown> | null;
  extraction_metadata: Record<string, unknown> | null;
  held_at: string | null;
  hold_reason: string | null;
  order_group_id: string | null;
  consolidation_box_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipientProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export interface HubEventRow {
  order_id: string;
  occurred_at: string;
  weight_lbs: number | null;
  location: string | null;
}

export interface BoxRefRow {
  id: string;
  label: string | null;
  departs_at: string | null;
  status: string;
}

const PACKAGE_COLUMNS =
  "id, package_no, reference, status, service, origin, destination, weight_lbs, length_in, width_in, height_in, carrier, tracking_number, fragile, this_way_up, keep_dry, notes, created_by, sealed_at, sealed_by, shipped_at, shipped_by, label_printed_at, label_print_count, created_at, updated_at";

const ITEM_COLUMNS = "id, package_id, order_id, description, quantity, added_by, created_at";

const ORDER_COLUMNS =
  "id, order_no, user_id, status, product_name, product_url, product_image_url, quantity, special_instructions, pricing, extraction_metadata, held_at, hold_reason, order_group_id, consolidation_box_id, created_at, updated_at";

/** Numeric columns arrive from PostgREST as strings; the DTOs want numbers. */
function toPackageRow(raw: Record<string, unknown>): PackageRow {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...(raw as unknown as PackageRow),
    package_no: Number(raw.package_no),
    weight_lbs: num(raw.weight_lbs),
    length_in: num(raw.length_in),
    width_in: num(raw.width_in),
    height_in: num(raw.height_in),
  };
}

// ── Packages ────────────────────────────────────────────────────────────────

export async function listPackages(filters: {
  statuses?: PackageStatus[];
  limit?: number;
  shippedSince?: string;
} = {}): Promise<PackageRow[]> {
  let query = createAdminClient().from("warehouse_packages").select(PACKAGE_COLUMNS);
  if (filters.statuses?.length) query = query.in("status", filters.statuses);
  if (filters.shippedSince) query = query.gte("shipped_at", filters.shippedSince);
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(filters.limit ?? 100);
  if (error) throw new Error(`Failed to load packages: ${error.message}`);
  return (data ?? []).map((r) => toPackageRow(r as Record<string, unknown>));
}

export async function countPackagesByStatus(): Promise<Record<PackageStatus, number>> {
  const db = createAdminClient();
  const statuses: PackageStatus[] = ["packing", "sealed", "shipped"];
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
  return Object.fromEntries(counts) as Record<PackageStatus, number>;
}

export async function getPackageById(id: string): Promise<PackageRow | null> {
  const { data, error } = await createAdminClient()
    .from("warehouse_packages")
    .select(PACKAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the package: ${error.message}`);
  return data ? toPackageRow(data as Record<string, unknown>) : null;
}

export async function getPackageByReference(reference: string): Promise<PackageRow | null> {
  const { data, error } = await createAdminClient()
    .from("warehouse_packages")
    .select(PACKAGE_COLUMNS)
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the package: ${error.message}`);
  return data ? toPackageRow(data as Record<string, unknown>) : null;
}

export type PackagePatch = Partial<
  Pick<
    PackageRow,
    | "status"
    | "service"
    | "origin"
    | "destination"
    | "weight_lbs"
    | "length_in"
    | "width_in"
    | "height_in"
    | "carrier"
    | "tracking_number"
    | "fragile"
    | "this_way_up"
    | "keep_dry"
    | "notes"
    | "sealed_at"
    | "sealed_by"
    | "shipped_at"
    | "shipped_by"
    | "label_printed_at"
    | "label_print_count"
  >
>;

export async function insertPackage(
  input: PackagePatch & { created_by: string },
): Promise<PackageRow> {
  const { data, error } = await createAdminClient()
    .from("warehouse_packages")
    .insert(input)
    .select(PACKAGE_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create the package: ${error.message}`);
  return toPackageRow(data as Record<string, unknown>);
}

/**
 * Update guarded on the status the caller saw, so two operators acting on one
 * package at once cannot both seal it, or edit it while the other ships it.
 * Null means the guard did not match — the caller answers 409.
 */
export async function updatePackage(
  id: string,
  expectedStatus: PackageStatus | PackageStatus[],
  patch: PackagePatch,
): Promise<PackageRow | null> {
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const { data, error } = await createAdminClient()
    .from("warehouse_packages")
    .update(patch)
    .eq("id", id)
    .in("status", statuses)
    .select(PACKAGE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update the package: ${error.message}`);
  return data ? toPackageRow(data as Record<string, unknown>) : null;
}

/** Only a package still on the bench can be deleted; its items cascade. */
export async function deletePackingPackage(id: string): Promise<PackageRow | null> {
  const { data, error } = await createAdminClient()
    .from("warehouse_packages")
    .delete()
    .eq("id", id)
    .eq("status", "packing")
    .select(PACKAGE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to delete the package: ${error.message}`);
  return data ? toPackageRow(data as Record<string, unknown>) : null;
}

// ── Package items ───────────────────────────────────────────────────────────

export async function listPackageItems(packageIds: string[]): Promise<PackageItemRow[]> {
  if (packageIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("warehouse_package_items")
    .select(ITEM_COLUMNS)
    .in("package_id", packageIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load package contents: ${error.message}`);
  return (data ?? []) as PackageItemRow[];
}

/** Which package each of these orders is in, if any. */
export async function listItemsForOrders(orderIds: string[]): Promise<PackageItemRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("warehouse_package_items")
    .select(ITEM_COLUMNS)
    .in("order_id", orderIds);
  if (error) throw new Error(`Failed to load package contents: ${error.message}`);
  return (data ?? []) as PackageItemRow[];
}

/**
 * Put these lines in a package. The partial unique index on `order_id` is the
 * real guard against an order going into two packages: a clash comes back as
 * `23505`, which the caller turns into a 409 naming the conflict.
 */
export async function insertPackageItems(
  rows: Array<{
    package_id: string;
    order_id: string | null;
    description: string | null;
    quantity: number;
    added_by: string;
  }>,
): Promise<{ items: PackageItemRow[]; conflict: boolean }> {
  if (rows.length === 0) return { items: [], conflict: false };
  const { data, error } = await createAdminClient()
    .from("warehouse_package_items")
    .insert(rows)
    .select(ITEM_COLUMNS);
  if (error) {
    if (error.code === "23505") return { items: [], conflict: true };
    throw new Error(`Failed to add to the package: ${error.message}`);
  }
  return { items: (data ?? []) as PackageItemRow[], conflict: false };
}

export async function deletePackageItem(
  packageId: string,
  itemId: string,
): Promise<PackageItemRow | null> {
  const { data, error } = await createAdminClient()
    .from("warehouse_package_items")
    .delete()
    .eq("id", itemId)
    .eq("package_id", packageId)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to remove the item: ${error.message}`);
  return (data as PackageItemRow | null) ?? null;
}

// ── Orders, recipients, hub arrivals ────────────────────────────────────────

export async function listWarehouseOrders(filters: {
  statuses?: string[];
  ids?: string[];
  limit?: number;
}): Promise<WarehouseOrderRow[]> {
  if (filters.ids && filters.ids.length === 0) return [];
  let query = createAdminClient().from("orders").select(ORDER_COLUMNS);
  if (filters.statuses?.length) query = query.in("status", filters.statuses);
  if (filters.ids) query = query.in("id", filters.ids);
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(filters.limit ?? 300);
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return (data ?? []) as WarehouseOrderRow[];
}

/** Look an order up by the number on its paperwork, "TM-00042". */
export async function getWarehouseOrderByNo(orderNo: string): Promise<WarehouseOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the order: ${error.message}`);
  return (data as WarehouseOrderRow | null) ?? null;
}

export async function listRecipientProfiles(userIds: string[]): Promise<RecipientProfileRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, first_name, last_name, phone")
    .in("id", userIds);
  if (error) throw new Error(`Failed to load recipients: ${error.message}`);
  return (data ?? []) as RecipientProfileRow[];
}

/** The frozen "Deliver to" of each group — what the label prints. */
export async function listGroupDeliverySnapshots(
  groupIds: string[],
): Promise<Map<string, Record<string, unknown> | null>> {
  const out = new Map<string, Record<string, unknown> | null>();
  if (groupIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("order_groups")
    .select("id, delivery_address")
    .in("id", groupIds);
  if (error) throw new Error(`Failed to load delivery details: ${error.message}`);
  for (const row of data ?? []) {
    out.set(row.id as string, (row.delivery_address as Record<string, unknown> | null) ?? null);
  }
  return out;
}

/** The latest hub arrival per order. */
export async function listHubArrivals(orderIds: string[]): Promise<Map<string, HubEventRow>> {
  const out = new Map<string, HubEventRow>();
  if (orderIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("order_events")
    .select("order_id, occurred_at, weight_lbs, location")
    .eq("kind", "hub_received")
    .in("order_id", orderIds)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(`Failed to load hub arrivals: ${error.message}`);
  for (const row of data ?? []) {
    const id = row.order_id as string;
    if (out.has(id)) continue;
    out.set(id, {
      order_id: id,
      occurred_at: row.occurred_at as string,
      weight_lbs: row.weight_lbs === null ? null : Number(row.weight_lbs),
      location: (row.location as string | null) ?? null,
    });
  }
  return out;
}

/** Photo ids per order, newest first — the first one is the thumbnail. */
export async function listPhotoIdsByOrder(orderIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (orderIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("order_photos")
    .select("id, order_id")
    .in("order_id", orderIds)
    .order("taken_at", { ascending: false });
  if (error) throw new Error(`Failed to load photos: ${error.message}`);
  for (const row of data ?? []) {
    const id = row.order_id as string;
    out.set(id, [...(out.get(id) ?? []), row.id as string]);
  }
  return out;
}

export async function listBoxRefs(ids: string[]): Promise<Map<string, BoxRefRow>> {
  const out = new Map<string, BoxRefRow>();
  if (ids.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("consolidation_boxes")
    .select("id, label, departs_at, status")
    .in("id", ids);
  if (error) throw new Error(`Failed to load freight boxes: ${error.message}`);
  for (const row of data ?? []) out.set(row.id as string, row as BoxRefRow);
  return out;
}

/** Open feedback per order — an item with an open objection is flagged on the bench. */
export async function listOpenFeedbackOrderIds(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from("order_feedback")
    .select("order_id")
    .in("order_id", orderIds)
    .in("status", ["open", "in_review"])
    .neq("verdict", "looks_right");
  if (error) throw new Error(`Failed to load feedback: ${error.message}`);
  return new Set((data ?? []).map((r) => r.order_id as string));
}

export async function getWarehouseAddress(): Promise<Record<string, unknown> | null> {
  const { data, error } = await createAdminClient()
    .from("site_settings")
    .select("value")
    .eq("key", "warehouse_address")
    .maybeSingle();
  if (error) return null;
  const value = data?.value;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export async function getProfileNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids);
  if (error) return out;
  for (const row of data ?? []) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (name) out.set(row.id as string, name);
  }
  return out;
}
