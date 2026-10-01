import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for the public tracking lookup (086).
 *
 * The page is open to anyone, so it never reads through PostgREST as `anon`:
 * every read here is the service role with a NARROW column list, and the
 * service decides what of it leaves. Nothing here selects a price, a payment,
 * an address, a name or a carrier/air-waybill number (those are internal). The two exceptions are the verifier reads at the
 * bottom, which return a phone and an email to be COMPARED server-side and
 * never forwarded.
 */

export interface TrackingOrderRow {
  id: string;
  order_no: string;
  user_id: string;
  status: string;
  product_name: string | null;
  product_url: string | null;
  product_image_url: string | null;
  eta_from: string | null;
  eta_to: string | null;
  estimated_delivery_date: string | null;
  delivered_at: string | null;
  order_group_id: string | null;
  /** `pricing->>delivery_eta_from/to`, the quote's forecast. The rest of `pricing` is not read. */
  est_from: string | null;
  est_to: string | null;
  platform: string | null;
}

export interface TrackingEventRow {
  kind: string;
  title: string;
  location: string | null;
  weight_lbs: number | null;
  occurred_at: string;
}

const ORDER_COLUMNS =
  "id, order_no, user_id, status, product_name, product_url, product_image_url, eta_from, eta_to, estimated_delivery_date, delivered_at, order_group_id, est_from:pricing->>delivery_eta_from, est_to:pricing->>delivery_eta_to, platform:extraction_metadata->>platform";

export async function getTrackingOrderByNo(orderNo: string): Promise<TrackingOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the order: ${error.message}`);
  return (data as unknown as TrackingOrderRow | null) ?? null;
}

/**
 * Customer-visible events: kind, title, place, weight, time. `detail` is NOT
 * selected — it carries the payment channel and "Signed by <name>", which a
 * stranger holding a tracking number has no business reading.
 */
export async function listTrackingEvents(orderId: string): Promise<TrackingEventRow[]> {
  const { data, error } = await createAdminClient()
    .from("order_events")
    .select("kind, title, location, weight_lbs, occurred_at")
    .eq("order_id", orderId)
    .eq("is_customer_visible", true)
    .order("occurred_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to load updates: ${error.message}`);
  return ((data ?? []) as TrackingEventRow[]).map((e) => ({
    ...e,
    weight_lbs: e.weight_lbs === null ? null : Number(e.weight_lbs),
  }));
}

// ── Verifier reads: compared on the server, never returned ──────────────────

/** Every phone number on file for this order: the checkout snapshot and the profile. */
export async function getOrderPhones(order: Pick<TrackingOrderRow, "user_id" | "order_group_id">): Promise<string[]> {
  const db = createAdminClient();
  const [group, profile] = await Promise.all([
    order.order_group_id
      ? db.from("order_groups").select("phone:delivery_address->>phone").eq("id", order.order_group_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("profiles").select("phone").eq("id", order.user_id).maybeSingle(),
  ]);
  return [
    (group.data as { phone?: string | null } | null)?.phone,
    (profile.data as { phone?: string | null } | null)?.phone,
  ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

export async function getOrderOwnerEmail(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}
