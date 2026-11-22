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

/**
 * The newest notification of `event` whose payload names `targetId` under
 * `targetKey`, any channel or status. Used to read back what a customer was
 * last told (the re-price notice compares against it).
 */
export async function findLatestNotificationFor(
  userId: string,
  event: string,
  targetKey: string,
  targetId: string,
): Promise<NotificationRow | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .eq("event", event)
    .filter(`payload->>${targetKey}`, "eq", targetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read notifications: ${error.message}`);
  return (data as unknown as NotificationRow | null) ?? null;
}

// ── Order-placed delivery (site brief Fix 13) ───────────────────────────────

/** How the customer's "paid" message went: sent (email, or the bell when email is off), or failed. */
export interface DeliveryOutcome {
  status: "sent" | "failed";
  reason?: string | null;
}

const RETRY_AFTER_MS = 15 * 60_000;
export const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Record the send on the customer's `order_placed` rows for these orders. A
 * failure is retried (15 min apart) until the third attempt, then stays failed.
 */
export async function markOrderPlacedDelivery(userId: string, orderIds: readonly string[], outcome: DeliveryOutcome): Promise<number> {
  if (orderIds.length === 0) return 0;
  const db = createAdminClient();
  const { data: rows, error } = await db
    .from("notifications")
    .select("id, attempts")
    .eq("user_id", userId)
    .eq("event", "order_placed")
    .in("status", ["pending", "failed"])
    .in("payload->>orderId", [...orderIds]);
  if (error) throw new Error(`Failed to load order notifications: ${error.message}`);
  const now = new Date();
  for (const row of (rows ?? []) as { id: string; attempts: number }[]) {
    const attempts = Math.min(MAX_DELIVERY_ATTEMPTS, (row.attempts ?? 0) + 1);
    const patch =
      outcome.status === "sent"
        ? { status: "sent", sent_at: now.toISOString(), attempts, last_attempt_at: now.toISOString(), error_reason: null, next_attempt_at: null }
        : {
            status: "failed",
            attempts,
            last_attempt_at: now.toISOString(),
            error_reason: (outcome.reason ?? "Send failed").slice(0, 500),
            next_attempt_at: attempts < MAX_DELIVERY_ATTEMPTS ? new Date(now.getTime() + RETRY_AFTER_MS).toISOString() : null,
          };
    const { error: updateError } = await db.from("notifications").update(patch).eq("id", row.id);
    if (updateError) throw new Error(`Failed to record the send: ${updateError.message}`);
  }
  return rows?.length ?? 0;
}

/** Failed `order_placed` rows due a retry. */
export async function listOrderPlacedRetries(limit: number): Promise<Array<{ id: string; user_id: string; order_id: string }>> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .select("id, user_id, payload")
    .eq("event", "order_placed")
    .eq("status", "failed")
    .lt("attempts", MAX_DELIVERY_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load retries: ${error.message}`);
  return ((data ?? []) as { id: string; user_id: string; payload: { orderId?: string } | null }[])
    .filter((r) => typeof r.payload?.orderId === "string")
    .map((r) => ({ id: r.id, user_id: r.user_id, order_id: r.payload!.orderId! }));
}

/**
 * An admin's recorded decision on pending rows older than `olderThan` (Fix 13):
 * `shown_in_bell` closes them as delivered in the app (the bell showed them;
 * nothing is sent now), `cancelled` closes them as never sent. Returns the ids.
 */
export async function settleStalePendingNotifications(olderThan: Date, disposition: "shown_in_bell" | "cancelled", note: string): Promise<string[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("notifications")
    .select("id")
    .eq("status", "pending")
    .eq("channel", "email")
    .lt("created_at", olderThan.toISOString())
    .limit(1000);
  if (error) throw new Error(`Failed to load pending notifications: ${error.message}`);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];
  const now = new Date().toISOString();
  const patch =
    disposition === "shown_in_bell"
      ? { status: "sent", sent_at: now, error_reason: note.slice(0, 500) }
      : { status: "failed", error_code: "cancelled", error_reason: note.slice(0, 500), next_attempt_at: null };
  for (let i = 0; i < ids.length; i += 200) {
    const { error: updateError } = await db.from("notifications").update(patch).in("id", ids.slice(i, i + 200)).eq("status", "pending");
    if (updateError) throw new Error(`Failed to settle notifications: ${updateError.message}`);
  }
  return ids;
}
