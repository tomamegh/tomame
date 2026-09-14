import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";
import type {
  Notification,
  NotificationListResponse,
  MarkNotificationReadResult,
  MarkAllNotificationsReadResult,
} from "../types";


async function getNotificationsByUserId(
  client: SupabaseClient,
  userId: string,
): Promise<Notification[]> {
  const { data, error } = await client
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getNotificationsByUserId failed", {
      userId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as Notification[];
}

/**
 * Minimal ownership probe. Deliberately selects only the three columns the
 * read flow needs — never the payload — so a caller who does not own the row
 * cannot learn anything about it.
 */
async function getNotificationOwnership(
  client: SupabaseClient,
  id: string,
): Promise<{ id: string; user_id: string; read_at: string | null } | null> {
  const { data, error } = await client
    .from("notifications")
    .select("id, user_id, read_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error("getNotificationOwnership failed", { id, error: error.message });
    throw new APIError(500, "Failed to load notification");
  }
  return (data ?? null) as { id: string; user_id: string; read_at: string | null } | null;
}

/**
 * Stamps `read_at` on one row, but only while it is still unread — the
 * `is("read_at", null)` guard is what makes a concurrent double-PATCH
 * idempotent rather than a last-writer-wins race that moves the timestamp.
 * Returns the rows it actually changed (0 or 1).
 */
async function stampNotificationRead(
  client: SupabaseClient,
  id: string,
  readAt: string,
): Promise<{ id: string; read_at: string | null }[]> {
  const { data, error } = await client
    .from("notifications")
    .update({ read_at: readAt })
    .eq("id", id)
    .is("read_at", null)
    .select("id, read_at");

  if (error) {
    logger.error("stampNotificationRead failed", { id, error: error.message });
    throw new APIError(500, "Failed to mark notification read");
  }
  return (data ?? []) as { id: string; read_at: string | null }[];
}

/** Stamps every still-unread row for one user. Returns the rows it changed. */
async function stampAllNotificationsRead(
  client: SupabaseClient,
  userId: string,
  readAt: string,
): Promise<{ id: string }[]> {
  const { data, error } = await client
    .from("notifications")
    .update({ read_at: readAt })
    .eq("user_id", userId)
    .is("read_at", null)
    .select("id");

  if (error) {
    logger.error("stampAllNotificationsRead failed", {
      userId,
      error: error.message,
    });
    throw new APIError(500, "Failed to mark notifications read");
  }
  return (data ?? []) as { id: string }[];
}

/**
 * Unread tally for the nav bell. `head: true` + `count: "exact"` so PostgREST
 * answers from `idx_notifications_unread` and ships no rows — this runs on
 * every app-shell render.
 */
async function countUnreadByUserId(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    logger.error("countUnreadByUserId failed", { userId, error: error.message });
    return 0;
  }
  return count ?? 0;
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function listUserNotifications(
  user: PlatformUser,
): Promise<NotificationListResponse> {
  const client = createAdminClient();
  // Both in one round trip: the shell renders the list and the bell's dot from
  // a single GET. `unread_count` comes from the counting query rather than
  // being derived from `notifications` so it stays correct if this list ever
  // grows a limit.
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsByUserId(client, user.id),
    countUnreadByUserId(client, user.id),
  ]);
  return {
    notifications,
    // `count` keeps its original meaning: total notifications, not unread.
    count: notifications.length,
    unread_count: unreadCount,
  };
}

/** Unread tally on its own, for callers that do not need the list. */
export async function countUnreadNotifications(
  user: PlatformUser,
): Promise<number> {
  return countUnreadByUserId(createAdminClient(), user.id);
}

/**
 * Marks ONE notification read.
 *
 * Ownership is enforced here, not by RLS: migration 041 adds no client UPDATE
 * policy because RLS cannot restrict an UPDATE to a single column, so such a
 * policy would also let a customer rewrite `status` or `payload`. Every write
 * therefore goes through the service-role client *after* this check.
 *
 * A row owned by someone else raises 404, not 403 — a 403 would confirm the id
 * exists, which is exactly the existence leak this endpoint must not have.
 *
 * NO audit_logs entry: CLAUDE.md scopes auditing to payment status, order
 * status, user roles and job state. Read state is none of those. This omission
 * is deliberate, not an oversight.
 */
export async function markNotificationRead(
  user: PlatformUser,
  notificationId: string,
): Promise<MarkNotificationReadResult> {
  const client = createAdminClient();
  const row = await getNotificationOwnership(client, notificationId);

  // Same error for "no such row" and "not yours" — indistinguishable by design.
  if (!row || row.user_id !== user.id) {
    throw new APIError(404, "Notification not found");
  }

  // Already read: succeed without touching the row, leaving read_at where it is.
  if (row.read_at) {
    return { id: row.id, read_at: row.read_at, already_read: true };
  }

  const readAt = new Date().toISOString();
  const updated = await stampNotificationRead(client, notificationId, readAt);

  if (updated.length === 0) {
    // Lost a race with a concurrent PATCH; that call's timestamp stands.
    const current = await getNotificationOwnership(client, notificationId);
    return {
      id: notificationId,
      read_at: current?.read_at ?? readAt,
      already_read: true,
    };
  }

  return {
    id: notificationId,
    read_at: updated[0]?.read_at ?? readAt,
    already_read: false,
  };
}

/**
 * Marks every unread notification belonging to the caller read. Scoped by
 * `user_id` in the update itself, so it can never reach another user's rows.
 * Idempotent: a second call updates nothing and reports `updated: 0`.
 *
 * No audit_logs entry, for the same reason as markNotificationRead.
 */
export async function markAllNotificationsRead(
  user: PlatformUser,
): Promise<MarkAllNotificationsReadResult> {
  const readAt = new Date().toISOString();
  const updated = await stampAllNotificationsRead(
    createAdminClient(),
    user.id,
    readAt,
  );
  return { updated: updated.length };
}

export async function createOrderNotifications(
  userId: string,
  orderId: string,
  productName: string,
  totalGhs: number,
): Promise<void> {
  const admin = createAdminClient();

  // Fetch all admin user IDs from profiles
  const { data: adminProfiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (profilesError) {
    logger.error("createOrderNotifications: failed to fetch admin profiles", {
      error: profilesError.message,
    });
  }

  const adminIds = (adminProfiles ?? []).map((p: { id: string }) => p.id);

  const payload = { orderId, productName, totalGhs };

  // Build inserts: one for the placing user + one per admin (skip duplicates)
  const recipientIds = [...new Set([userId, ...adminIds])];
  const inserts = recipientIds.map((id) => ({
    user_id: id,
    channel: "email" as const,
    event: id === userId ? "order_placed" : "order_placed_admin",
    payload,
    status: "pending" as const,
  }));

  const { error } = await admin.from("notifications").insert(inserts);

  if (error) {
    logger.error("createOrderNotifications: insert failed", {
      error: error.message,
      orderId,
    });
  }
}
