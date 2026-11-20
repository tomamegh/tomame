import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for an order's WhatsApp state (104): the checkout opt-in, the
 * failed-send follow-up flag, and the staff "WhatsApp sent" log. Service role
 * only; no business logic.
 */

export interface OrderWhatsAppConsent {
  id: string;
  whatsapp_updates: boolean | null;
}

export async function getOrdersWhatsAppConsent(orderIds: readonly string[]): Promise<OrderWhatsAppConsent[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("id, whatsapp_updates")
    .in("id", [...orderIds]);
  if (error) throw new Error(`Failed to load WhatsApp opt-in: ${error.message}`);
  return (data ?? []) as OrderWhatsAppConsent[];
}

/** Stamp opted-in orders whose automated WhatsApp failed, for same-day manual follow-up. */
export async function markOrdersWhatsAppFailed(orderIds: readonly string[], reason: string, atIso: string): Promise<void> {
  if (orderIds.length === 0) return;
  const { error } = await createAdminClient()
    .from("orders")
    .update({ whatsapp_failed_at: atIso, whatsapp_failed_reason: reason.slice(0, 300) })
    .in("id", [...orderIds])
    .eq("whatsapp_updates", true);
  if (error) throw new Error(`Failed to flag WhatsApp follow-up: ${error.message}`);
}

/** Cleared when staff record that they messaged the customer themselves. */
export async function clearOrderWhatsAppFailed(orderId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("orders")
    .update({ whatsapp_failed_at: null, whatsapp_failed_reason: null })
    .eq("id", orderId);
  if (error) throw new Error(`Failed to clear WhatsApp follow-up: ${error.message}`);
}

/** Writes the checkout tick onto a group's orders. */
export async function setOrdersWhatsAppUpdates(orderIds: readonly string[], value: boolean): Promise<void> {
  if (orderIds.length === 0) return;
  const { error } = await createAdminClient()
    .from("orders")
    .update({ whatsapp_updates: value })
    .in("id", [...orderIds]);
  if (error) throw new Error(`Failed to record WhatsApp opt-in: ${error.message}`);
}

export async function setOrderGroupWhatsAppUpdates(groupId: string, value: boolean): Promise<void> {
  const { error } = await createAdminClient()
    .from("order_groups")
    .update({ whatsapp_updates: value })
    .eq("id", groupId);
  if (error) throw new Error(`Failed to record WhatsApp opt-in: ${error.message}`);
}

// ── Staff send log ──────────────────────────────────────────────────────────

export interface OrderWhatsAppSendRow {
  id: string;
  order_id: string;
  stage: string;
  template_key: string;
  sent_by: string | null;
  sent_at: string;
  sender_name: string | null;
}

export async function listOrderWhatsAppSends(orderId: string): Promise<OrderWhatsAppSendRow[]> {
  const { data, error } = await createAdminClient()
    .from("order_whatsapp_sends")
    .select("id, order_id, stage, template_key, sent_by, sent_at, profiles:sent_by(first_name, last_name)")
    .eq("order_id", orderId)
    .order("sent_at", { ascending: true });
  if (error) throw new Error(`Failed to load WhatsApp sends: ${error.message}`);
  return ((data ?? []) as unknown as Array<Omit<OrderWhatsAppSendRow, "sender_name"> & {
    profiles: { first_name: string | null; last_name: string | null } | null;
  }>).map(({ profiles, ...row }) => ({
    ...row,
    sender_name: [profiles?.first_name, profiles?.last_name].filter(Boolean).join(" ") || null,
  }));
}

/** One row per order and stage. Answers null when it was already recorded (23505). */
export async function insertOrderWhatsAppSend(input: {
  order_id: string;
  stage: string;
  template_key: string;
  sent_by: string;
}): Promise<{ id: string; sent_at: string } | null> {
  const { data, error } = await createAdminClient()
    .from("order_whatsapp_sends")
    .insert(input)
    .select("id, sent_at")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Failed to record WhatsApp send: ${error.message}`);
  }
  return data as { id: string; sent_at: string };
}

export interface OrderWhatsAppState {
  whatsapp_updates: boolean | null;
  whatsapp_failed_at: string | null;
  whatsapp_failed_reason: string | null;
}

export async function getOrderWhatsAppState(orderId: string): Promise<OrderWhatsAppState | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("whatsapp_updates, whatsapp_failed_at, whatsapp_failed_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load WhatsApp state: ${error.message}`);
  return (data as OrderWhatsAppState | null) ?? null;
}

export interface OrderNotifyFacts {
  /** The checkout's delivery snapshot (`order_groups.delivery_address`), or the saved address. */
  delivery: Record<string, unknown> | null;
  eta_to: string | null;
  estimated_delivery_date: string | null;
}

/** What a stage message names beyond the order itself: where it is going, and when. */
export async function getOrderNotifyFacts(orderId: string): Promise<OrderNotifyFacts | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select("eta_to, estimated_delivery_date, delivery_address_id, order_groups(delivery_address)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load order delivery facts: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as {
    eta_to: string | null;
    estimated_delivery_date: string | null;
    delivery_address_id: string | null;
    order_groups: { delivery_address: Record<string, unknown> | null } | null;
  };
  let delivery = row.order_groups?.delivery_address ?? null;
  if (!delivery && row.delivery_address_id) {
    const address = await db
      .from("delivery_addresses")
      .select("area, city")
      .eq("id", row.delivery_address_id)
      .maybeSingle();
    if (address.error) throw new Error(`Failed to load delivery address: ${address.error.message}`);
    delivery = (address.data as Record<string, unknown> | null) ?? null;
  }
  return { delivery, eta_to: row.eta_to, estimated_delivery_date: row.estimated_delivery_date };
}
