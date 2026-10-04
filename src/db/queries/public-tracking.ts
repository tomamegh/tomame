import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for the public tracking lookup (086).
 *
 * The page is open to anyone, so it never reads through PostgREST as `anon`:
 * every read here is the service role with a NARROW column list, and the
 * service decides what of it leaves. Nothing here selects a price, a payment,
 * an address, a name or a carrier/air-waybill number (those are internal). The
 * exceptions are the verifier reads at the bottom, which return phones and an
 * email to be COMPARED server-side and never forwarded, and the read of the
 * second factor's failure count.
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
  /** Read only to find a phone to compare against; never returned. */
  delivery_address_id: string | null;
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
  "id, order_no, user_id, status, product_name, product_url, product_image_url, eta_from, eta_to, estimated_delivery_date, delivered_at, order_group_id, delivery_address_id, est_from:pricing->>delivery_eta_from, est_to:pricing->>delivery_eta_to, platform:extraction_metadata->>platform";

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

/**
 * Every phone number on file for this order: the checkout snapshot, the saved
 * address the order or its bag used (a pickup bag snapshots no phone, so this
 * is often the only one), and the profile. Empty means none is on file. Throws
 * on a failed read: an outage must not read as "that does not match".
 */
export async function getOrderPhones(
  order: Pick<TrackingOrderRow, "user_id" | "order_group_id" | "delivery_address_id">,
): Promise<string[]> {
  const db = createAdminClient();
  const none = Promise.resolve({ data: null, error: null });
  const [group, orderAddress, profile] = await Promise.all([
    order.order_group_id
      ? db
          .from("order_groups")
          .select("phone:delivery_address->>phone, address:delivery_addresses(phone)")
          .eq("id", order.order_group_id)
          .maybeSingle()
      : none,
    order.delivery_address_id
      ? db.from("delivery_addresses").select("phone").eq("id", order.delivery_address_id).maybeSingle()
      : none,
    db.from("profiles").select("phone").eq("id", order.user_id).maybeSingle(),
  ]);
  const failed = group.error ?? orderAddress.error ?? profile.error;
  if (failed) throw new Error(`Failed to read the phones on file: ${failed.message}`);

  const g = group.data as { phone?: string | null; address?: { phone?: string | null } | null } | null;
  return [
    g?.phone,
    g?.address?.phone,
    (orderAddress.data as { phone?: string | null } | null)?.phone,
    (profile.data as { phone?: string | null } | null)?.phone,
  ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

/** The account's email. Throws on a failed read, like `getOrderPhones`. */
export async function getOrderOwnerEmail(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
  if (error) throw new Error(`Failed to read the account email: ${error.message}`);
  return data.user?.email ?? null;
}

/**
 * How many times `key` has been hit in the current fixed window of `rate_limits`
 * (077), WITHOUT hitting it. The window start is computed exactly as
 * `hit_rate_limit` computes it. The tracking service uses this to count only
 * wrong second factors against a reference: it peeks before checking and hits
 * only after a miss. Throws on a failed read.
 */
export async function peekRateLimitCount(
  key: string,
  windowSeconds: number,
): Promise<{ count: number; resetAt: number }> {
  const windowStartMs = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds * 1000;
  const { data, error } = await createAdminClient()
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", new Date(windowStartMs).toISOString())
    .maybeSingle();
  if (error) throw new Error(`Failed to read the rate limit: ${error.message}`);
  return {
    count: Number((data as { count?: number } | null)?.count ?? 0),
    resetAt: windowStartMs + windowSeconds * 1000,
  };
}
