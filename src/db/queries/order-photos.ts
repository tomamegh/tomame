import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `order_photos` access — the warehouse photographs of a parcel (migration 054).
 *
 * Data access only. Who may upload one, which of them a customer may see, the
 * object that has to be written before the row and the `audit_logs` entry every
 * write owes are `features/order-photos/services` (CLAUDE.md: `db/queries`
 * holds no business logic and no auth checks).
 *
 * SERVICE ROLE THROUGHOUT, which is why this module is `server-only`. RLS grants
 * `authenticated` a SELECT and nothing else — a customer must never write their
 * own parcel's history, photographs included — so every write here would be
 * refused through a cookie-bound client, and the reads are filtered explicitly
 * (`customerVisibleOnly`) rather than relying on the policy, because the callers
 * that establish ownership themselves come through this same client.
 *
 * Errors are NOT swallowed. An admin who has just photographed a parcel must be
 * told when it did not save, and a serving route must fail loudly rather than
 * quietly answering "no photo" to a storage fault.
 */

/**
 * Where in the journey the picture was taken. A union rather than `string`: a
 * typo in a writer should fail typecheck, not the CHECK constraint at runtime
 * halfway through an upload whose bytes are already stored.
 */
export type OrderPhotoKind =
  | "hub_received"
  | "packed"
  | "damaged"
  | "delivered"
  | "other";

export interface OrderPhotoRow {
  id: string;
  order_id: string;
  /** The timeline entry this was taken for, when there is one (050). */
  event_id: string | null;
  kind: OrderPhotoKind;
  /** Object key inside the private `parcel-photos` bucket. Never a URL. */
  storage_path: string;
  content_type: string;
  width: number;
  height: number;
  byte_size: number;
  caption: string | null;
  is_customer_visible: boolean;
  taken_at: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface OrderPhotoInsert {
  order_id: string;
  storage_path: string;
  width: number;
  height: number;
  byte_size: number;
  event_id?: string | null;
  kind?: OrderPhotoKind;
  caption?: string | null;
  is_customer_visible?: boolean;
  taken_at?: string;
  uploaded_by?: string | null;
}

const COLUMNS =
  "id, order_id, event_id, kind, storage_path, content_type, width, height, byte_size, caption, is_customer_visible, taken_at, uploaded_by, created_at";

/** Write one photo row. The object is already in the bucket by this point. */
export async function insertOrderPhoto(input: OrderPhotoInsert): Promise<OrderPhotoRow> {
  const { data, error } = await createAdminClient()
    .from("order_photos")
    .insert(input)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`Failed to record the parcel photo: ${error.message}`);
  return normalizeRow(data as Record<string, unknown>);
}

/**
 * One order's photos, newest first — the order the journey screen draws them in.
 *
 * `customerVisibleOnly` is applied in SQL because this client bypasses RLS: the
 * customer's own screen reads through the service role once ownership has been
 * established, so an internal-only picture must be excluded here or not at all.
 */
export async function listOrderPhotos(
  orderId: string,
  options: { customerVisibleOnly?: boolean } = {},
): Promise<OrderPhotoRow[]> {
  let query = createAdminClient()
    .from("order_photos")
    .select(COLUMNS)
    .eq("order_id", orderId)
    .order("taken_at", { ascending: false });

  if (options.customerVisibleOnly) {
    query = query.eq("is_customer_visible", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load the parcel photos: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map(normalizeRow);
}

/** One photo by id, or null. The serving route's lookup. */
export async function getOrderPhoto(id: string): Promise<OrderPhotoRow | null> {
  const { data, error } = await createAdminClient()
    .from("order_photos")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the parcel photo: ${error.message}`);
  return data ? normalizeRow(data as Record<string, unknown>) : null;
}

/**
 * Delete one photo and hand the deleted row back, so the caller can remove the
 * object it named and record in `audit_logs` what disappeared. Null when there
 * was no such row.
 */
export async function deleteOrderPhoto(id: string): Promise<OrderPhotoRow | null> {
  const { data, error } = await createAdminClient()
    .from("order_photos")
    .delete()
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to delete the parcel photo: ${error.message}`);
  return data ? normalizeRow(data as Record<string, unknown>) : null;
}

/**
 * Just enough of an order to photograph it: whose it is, and what the customer
 * would be told it was.
 *
 * Lives here rather than in `db/queries/orders.ts` because it exists for this
 * feature alone — the upload needs `order_no` and `product_name` for the
 * notification it sends, which `getOrderOwner` deliberately does not carry.
 */
export async function getOrderPhotoContext(orderId: string): Promise<{
  id: string;
  user_id: string | null;
  order_no: string | null;
  product_name: string;
} | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("id, user_id, order_no, product_name")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the order: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    user_id: (row.user_id as string | null) ?? null,
    order_no: (row.order_no as string | null) ?? null,
    product_name: String(row.product_name ?? ""),
  };
}

// ── Row normalisation (PostgREST widens numerics to strings) ────────────────

function normalizeRow(row: Record<string, unknown>): OrderPhotoRow {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    event_id: (row.event_id as string | null) ?? null,
    kind: row.kind as OrderPhotoKind,
    storage_path: String(row.storage_path),
    content_type: String(row.content_type),
    width: Number(row.width),
    height: Number(row.height),
    byte_size: Number(row.byte_size),
    caption: (row.caption as string | null) ?? null,
    is_customer_visible: row.is_customer_visible === true,
    taken_at: String(row.taken_at),
    uploaded_by: (row.uploaded_by as string | null) ?? null,
    created_at: String(row.created_at),
  };
}
