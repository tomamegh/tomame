import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads and writes for the staff order alerts (087). Service role throughout:
 * the settings rows are private and `staff_alert_sends` has no client policy.
 * No rules here; `features/staff-alerts` decides what to send.
 */

// ── Settings ────────────────────────────────────────────────────────────────

export async function readSiteSettingValues(keys: string[]): Promise<Record<string, unknown>> {
  const { data, error } = await createAdminClient().from("site_settings").select("key, value").in("key", keys);
  if (error) throw new Error(`staff alerts: settings read failed: ${error.message}`);
  return Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
}

// ── The send log ────────────────────────────────────────────────────────────

export interface StaffAlertSendRow {
  id: number;
  event_key: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  attempts: number;
  subject: string | null;
  recipients: number;
  failed_recipients: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

/**
 * Claim one event. Returns the new row id, or null when the key already
 * exists: somebody else (the other Paystack delivery, a retried request) owns
 * this event and has sent or is sending it.
 */
export async function claimStaffAlertSend(row: {
  event_key: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
}): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from("staff_alert_sends")
    .insert({ ...row, status: "pending" })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return reclaimStaleStaffAlertSend(row.event_key);
    throw new Error(`staff alerts: claim failed: ${error.message}`);
  }
  return (data as { id: number } | null)?.id ?? null;
}

/** A claim older than this that never finished was cut off (timeout, crash, redeploy). */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Take over a claim left `pending` by a sender that died before finishing, so
 * the next caller (the webhook after a verify, a retry) still sends. A single
 * conditional UPDATE, so two callers cannot both win it.
 */
async function reclaimStaleStaffAlertSend(eventKey: string): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from("staff_alert_sends")
    .update({ created_at: new Date().toISOString() })
    .eq("event_key", eventKey)
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString())
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`staff alerts: reclaim failed: ${error.message}`);
  return (data as { id: number } | null)?.id ?? null;
}

export async function finishStaffAlertSend(
  id: number,
  patch: Pick<StaffAlertSendRow, "status" | "attempts" | "subject" | "recipients" | "failed_recipients" | "error">,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("staff_alert_sends")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`staff alerts: finish failed: ${error.message}`);
}

export async function listRecentStaffAlertSends(limit = 15): Promise<StaffAlertSendRow[]> {
  const { data, error } = await createAdminClient()
    .from("staff_alert_sends")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`staff alerts: recent sends failed: ${error.message}`);
  return (data ?? []) as StaffAlertSendRow[];
}

// ── What an email needs to say ──────────────────────────────────────────────

export interface StaffOrderRow {
  id: string;
  order_no: string | null;
  user_id: string;
  status: string;
  product_name: string;
  product_url: string | null;
  quantity: number;
  origin_country: string | null;
  pricing: { total_ghs?: number } | null;
  admin_total_ghs: number | null;
  needs_review: boolean;
  review_reasons: string[] | null;
  payment_id: string | null;
  order_group_id: string | null;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
}

const ORDER_COLUMNS =
  "id, order_no, user_id, status, product_name, product_url, quantity, origin_country, pricing, admin_total_ghs, needs_review, review_reasons, payment_id, order_group_id, tracking_number, carrier, created_at";

export async function getStaffOrder(orderId: string): Promise<StaffOrderRow | null> {
  const { data, error } = await createAdminClient().from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) throw new Error(`staff alerts: order read failed: ${error.message}`);
  return (data as StaffOrderRow | null) ?? null;
}

export async function listStaffOrdersByGroup(groupId: string): Promise<StaffOrderRow[]> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("order_group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`staff alerts: group orders read failed: ${error.message}`);
  return (data ?? []) as StaffOrderRow[];
}

export interface StaffGroupRow {
  id: string;
  user_id: string;
  status: string;
  item_count: number;
  total_ghs: number;
  delivery_fee_ghs: number | null;
  payment_id: string | null;
  created_at: string;
}

export async function getStaffGroup(groupId: string): Promise<StaffGroupRow | null> {
  const { data, error } = await createAdminClient()
    .from("order_groups")
    .select("id, user_id, status, item_count, total_ghs, delivery_fee_ghs, payment_id, created_at")
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(`staff alerts: group read failed: ${error.message}`);
  return (data as StaffGroupRow | null) ?? null;
}

export interface StaffPaymentRow {
  id: string;
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  channel: string | null;
  metadata: Record<string, unknown> | null;
  order_group_id: string | null;
  car_order_id: string | null;
}

export async function getStaffPayment(paymentId: string): Promise<StaffPaymentRow | null> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select("id, user_id, reference, amount, currency, status, channel, metadata, order_group_id, car_order_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new Error(`staff alerts: payment read failed: ${error.message}`);
  return (data as StaffPaymentRow | null) ?? null;
}

export interface StaffCarOrderRow {
  id: string;
  user_id: string;
  car_label: string;
  status: string;
  price_pesewas: number;
  deposit_pesewas: number;
  payment_id: string | null;
  cancel_reason: string | null;
}

export async function getStaffCarOrder(carOrderId: string): Promise<StaffCarOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_orders")
    .select("id, user_id, car_label, status, price_pesewas, deposit_pesewas, payment_id, cancel_reason")
    .eq("id", carOrderId)
    .maybeSingle();
  if (error) throw new Error(`staff alerts: car order read failed: ${error.message}`);
  return (data as StaffCarOrderRow | null) ?? null;
}

export interface StaffSourcingRow {
  id: string;
  user_id: string;
  product_url: string;
  product_name: string | null;
  sourcing_status: string | null;
  customer_price_hint_usd: number | null;
  customer_origin_hint: string | null;
}

export async function getStaffSourcingRequest(watchId: string): Promise<StaffSourcingRow | null> {
  const { data, error } = await createAdminClient()
    .from("price_watches")
    .select("id, user_id, product_url, product_name, sourcing_status, customer_price_hint_usd, customer_origin_hint")
    .eq("id", watchId)
    .eq("kind", "sourcing")
    .maybeSingle();
  if (error) throw new Error(`staff alerts: sourcing request read failed: ${error.message}`);
  return (data as StaffSourcingRow | null) ?? null;
}

export interface StaffAssistedRow {
  id: string;
  user_id: string | null;
  product_url: string;
  description: string;
  phone: string;
}

export async function getStaffAssistedRequest(requestId: string): Promise<StaffAssistedRow | null> {
  const { data, error } = await createAdminClient()
    .from("assisted_requests")
    .select("id, user_id, product_url, description, phone")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(`staff alerts: assisted request read failed: ${error.message}`);
  return (data as StaffAssistedRow | null) ?? null;
}

export interface StaffCustomer {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** Name and phone from `profiles`, the address from `auth.users` (profiles has no email column). */
export async function getStaffCustomer(userId: string): Promise<StaffCustomer> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: auth }] = await Promise.all([
    admin.from("profiles").select("first_name, last_name, phone").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const p = profile as { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  const name = [p?.first_name, p?.last_name].filter((s): s is string => !!s?.trim()).join(" ") || null;
  return { name, email: auth?.user?.email ?? null, phone: p?.phone ?? null };
}
