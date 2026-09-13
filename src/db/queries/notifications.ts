import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data access for `notifications` (migration 019) on the WRITE side — the row
 * that records an outbound message and how its delivery went.
 *
 * No business logic and no auth checks live here: the caller has already
 * decided a message is owed and to whom. The service-role client is used
 * throughout because migration 019 grants clients no INSERT or UPDATE at all —
 * every write to this table is a server decision, and a customer able to insert
 * here could manufacture a notification history.
 *
 * Errors are NOT swallowed. A missing relation must reach the service so
 * `isSchemaMissingError` can fail loudly on an un-migrated database rather than
 * silently dropping mail. PostgREST's structured `code` is lost in the rethrow,
 * so the message text is preserved verbatim — that is what the classifier
 * matches on (phase-2 handoff, gotcha 5).
 */

export type NotificationChannel = "email" | "whatsapp";
export type NotificationStatus = "pending" | "sent" | "failed";

export interface NotificationInsert {
  user_id: string;
  channel: NotificationChannel;
  event: string;
  payload: Record<string, unknown>;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  event: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  created_at: string;
  sent_at: string | null;
}

const NOTIFICATION_COLUMNS =
  "id, user_id, channel, event, payload, status, created_at, sent_at";

/**
 * Record an outbound notification as `pending`, BEFORE the transport is
 * attempted. The row is the durable fact that we decided to write to this
 * customer; whether Resend accepted it is a second, separate fact
 * (`markNotificationDelivered`). Inserting after a successful send would leave
 * every failed delivery with no trace at all.
 */
export async function insertNotification(input: NotificationInsert): Promise<NotificationRow> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("notifications")
    .insert({ ...input, status: "pending" })
    .select(NOTIFICATION_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to record notification: ${error?.message ?? "no row returned"}`);
  }
  return data as unknown as NotificationRow;
}

/**
 * Close out a pending notification. `sent_at` is stamped only on success, so a
 * failed row keeps a NULL `sent_at` and an admin listing filtered to
 * `status = 'failed'` reads as a delivery queue rather than a mystery.
 */
export async function markNotificationDelivered(
  notificationId: string,
  outcome: { status: Extract<NotificationStatus, "sent" | "failed">; sent_at?: string },
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("notifications")
    .update({
      status: outcome.status,
      sent_at: outcome.status === "sent" ? (outcome.sent_at ?? new Date().toISOString()) : null,
    })
    .eq("id", notificationId);

  if (error) throw new Error(`Failed to update notification: ${error.message}`);
}

/**
 * The address to write to.
 *
 * `profiles` carries no email column — the address lives in `auth.users` and is
 * only reachable through the admin API, which is why this is a function and not
 * a join. A user who has been deleted between the job claiming the watch and
 * this call answers null rather than throwing: there is nobody to email, which
 * is not an error in the run.
 */
export async function getRecipientEmail(userId: string): Promise<string | null> {
  const client = createAdminClient();
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error) throw new Error(`Failed to load notification recipient: ${error.message}`);
  return data?.user?.email ?? null;
}
