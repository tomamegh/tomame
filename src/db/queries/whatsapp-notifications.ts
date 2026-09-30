import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for WhatsApp rows in `notifications` (019 + 079).
 *
 * No business logic: what to send, when to retry and which status may follow
 * which live in `features/notifications/services/whatsapp.service.ts`. Every
 * write is the service role — 019 grants clients none.
 */

export type WhatsAppDeliveryStatus = "accepted" | "sent" | "delivered" | "read" | "failed";

export interface WhatsAppRecipient {
  first_name: string | null;
  phone: string | null;
  whatsapp_opt_in: boolean;
}

export interface WhatsAppNotificationRow {
  id: string;
  user_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  attempts: number;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  delivery_status: WhatsAppDeliveryStatus | null;
  created_at: string;
}

const COLUMNS =
  "id, user_id, event, payload, status, attempts, next_attempt_at, provider_message_id, delivery_status, created_at";

export async function getWhatsAppRecipient(userId: string): Promise<WhatsAppRecipient | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("first_name, phone, whatsapp_opt_in")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load WhatsApp recipient: ${error.message}`);
  return (data as WhatsAppRecipient | null) ?? null;
}

/** Inserts a pending row. Answers null when `dedupe_key` already exists (23505). */
export async function insertWhatsAppNotification(input: {
  user_id: string;
  event: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
}): Promise<{ id: string } | null> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .insert({ ...input, channel: "whatsapp", status: "pending", delivery_status: null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Failed to record notification: ${error.message}`);
  }
  return data as { id: string };
}

/** Pending whatsapp rows whose clock has come round, oldest first. */
export async function listDueWhatsAppNotifications(
  nowIso: string,
  limit: number,
): Promise<WhatsAppNotificationRow[]> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .select(COLUMNS)
    .eq("channel", "whatsapp")
    .eq("status", "pending")
    .or(`next_attempt_at.is.null,next_attempt_at.lte."${nowIso}"`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to list due WhatsApp notifications: ${error.message}`);
  return (data ?? []) as unknown as WhatsAppNotificationRow[];
}

/**
 * Optimistic claim: bump `attempts` and push the lease out, but only if nobody
 * else has since the row was read. False means another run has it.
 */
export async function claimWhatsAppNotification(
  id: string,
  seenAttempts: number,
  fields: { attempts: number; next_attempt_at: string; last_attempt_at: string },
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .update(fields)
    .eq("id", id)
    .eq("status", "pending")
    .eq("attempts", seenAttempts)
    .select("id");
  if (error) throw new Error(`Failed to claim WhatsApp notification: ${error.message}`);
  return (data ?? []).length === 1;
}

/** Close out or reschedule a claimed row. Guarded on `pending` so a terminal row never moves. */
export async function updatePendingWhatsAppNotification(
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("notifications")
    .update(fields)
    .eq("id", id)
    .eq("channel", "whatsapp")
    .eq("status", "pending");
  if (error) throw new Error(`Failed to update WhatsApp notification: ${error.message}`);
}

export async function findWhatsAppNotificationByMessageId(
  messageId: string,
): Promise<WhatsAppNotificationRow | null> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .select(COLUMNS)
    .eq("channel", "whatsapp")
    .eq("provider_message_id", messageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to find WhatsApp notification: ${error.message}`);
  return (data as unknown as WhatsAppNotificationRow | null) ?? null;
}

/**
 * Webhook write. Guarded on the delivery status the service decided it is
 * moving FROM, so two callbacks racing cannot move it backwards.
 */
export async function updateWhatsAppDelivery(
  id: string,
  from: WhatsAppDeliveryStatus | null,
  fields: Record<string, unknown>,
): Promise<boolean> {
  let query = createAdminClient().from("notifications").update(fields).eq("id", id);
  query = from === null ? query.is("delivery_status", null) : query.eq("delivery_status", from);
  const { data, error } = await query.select("id");
  if (error) throw new Error(`Failed to update WhatsApp delivery: ${error.message}`);
  return (data ?? []).length === 1;
}
