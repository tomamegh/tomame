import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin-side reads of `notifications` (019, extended by 041) — the record of
 * what the platform told a customer, on which channel, and whether it landed.
 *
 * WHY THIS FILE EXISTS AT ALL. `listAllNotifications` in
 * `features/notifications/services/notifications.service.ts` selects
 * `profiles(id, email, first_name, last_name)`, and `profiles` HAS NO `email`
 * COLUMN — migration 001 never created one, and `db/queries/notifications.ts`
 * says so in as many words ("`profiles` carries no email column — the address
 * lives in `auth.users`"). PostgREST answers 42703, the service logs and
 * returns `[]`, and so the admin notifications screen and the header bell have
 * both been rendering an empty list on every environment regardless of what the
 * table holds. The delivery log looked clean because it was blank.
 *
 * So the admin read is done here, without the phantom column, and the owner's
 * NAME is joined instead. An address, where one is needed, comes from
 * `auth.users` through the admin API — one call per user, which is why it is
 * not done for a list.
 *
 * Service-role client: migration 019 grants clients no write at all and the
 * admin SELECT policy would need a cookie-bound session this path may not have.
 * The caller must already have established that it is talking to an admin.
 */

export type AdminNotificationStatus = "pending" | "sent" | "failed";
export type AdminNotificationChannel = "email" | "whatsapp";

export interface AdminNotificationRow {
  id: string;
  user_id: string;
  channel: AdminNotificationChannel;
  event: string;
  payload: Record<string, unknown>;
  status: AdminNotificationStatus;
  created_at: string;
  sent_at: string | null;
  read_at: string | null;
  /** Owner's name, or null when the profile row has been removed. */
  recipient: { id: string; first_name: string | null; last_name: string | null } | null;
}

const COLUMNS =
  "id, user_id, channel, event, payload, status, created_at, sent_at, read_at";

type NotificationQueryRow = Omit<AdminNotificationRow, "recipient"> & {
  profiles: { id: string; first_name: string | null; last_name: string | null } | null;
};

export interface AdminNotificationFilters {
  status?: AdminNotificationStatus;
  channel?: AdminNotificationChannel;
  event?: string;
  userId?: string;
}

/**
 * The delivery log, newest first.
 *
 * Capped rather than unbounded: `notifications` grows by several rows per
 * order and the previous query pulled every one of them with no limit. An
 * admin reads this to find failures, and the failures filter is the way to do
 * that — not scrolling a year of successful mail.
 */
export async function listNotificationsForAdmin(
  filters: AdminNotificationFilters = {},
  limit = 100,
): Promise<AdminNotificationRow[]> {
  let query = createAdminClient()
    .from("notifications")
    .select(`${COLUMNS}, profiles(id, first_name, last_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.event) query = query.eq("event", filters.event);
  if (filters.userId) query = query.eq("user_id", filters.userId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load notifications: ${error.message}`);

  return ((data ?? []) as unknown as NotificationQueryRow[]).map(
    ({ profiles, ...row }) => ({ ...row, recipient: profiles ?? null }),
  );
}

export interface AdminNotificationCounts {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  /** Failures raised in the last 24 hours — the ones still worth chasing. */
  failedLast24h: number;
}

/**
 * Status totals for the whole table.
 *
 * Counted in the database rather than by measuring the length of the capped
 * list above: a "12 failed" tile derived from a 100-row page would silently
 * become "100 failed" the moment the log grew past the cap.
 */
export async function getAdminNotificationCounts(
  now: Date = new Date(),
): Promise<AdminNotificationCounts> {
  const db = createAdminClient();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const count = async (
    build: (db: ReturnType<typeof createAdminClient>) => PromiseLike<{
      count: number | null;
      error: { message: string } | null;
    }>,
    what: string,
  ): Promise<number> => {
    const { count: n, error } = await build(db);
    if (error) throw new Error(`Failed to count ${what}: ${error.message}`);
    return n ?? 0;
  };

  const [total, pending, sent, failed, failedLast24h] = await Promise.all([
    count((c) => c.from("notifications").select("id", { count: "exact", head: true }), "notifications"),
    count((c) => c.from("notifications").select("id", { count: "exact", head: true }).eq("status", "pending"), "pending notifications"),
    count((c) => c.from("notifications").select("id", { count: "exact", head: true }).eq("status", "sent"), "sent notifications"),
    count((c) => c.from("notifications").select("id", { count: "exact", head: true }).eq("status", "failed"), "failed notifications"),
    count((c) => c.from("notifications").select("id", { count: "exact", head: true }).eq("status", "failed").gt("created_at", dayAgo), "recent failed notifications"),
  ]);

  return { total, pending, sent, failed, failedLast24h };
}

/**
 * Which events actually occur, and how each is doing.
 *
 * Derived from a capped scan of recent rows rather than a GROUP BY, because
 * PostgREST cannot express one without a database view and the event vocabulary
 * is small (`order_placed`, `price_drop`, `paste_priced`, `paste_unreadable`,
 * …). The window is stated in the UI so the breakdown is never read as
 * all-time.
 */
export async function listRecentNotificationEvents(
  limit = 500,
): Promise<{ event: string; status: AdminNotificationStatus }[]> {
  const { data, error } = await createAdminClient()
    .from("notifications")
    .select("event, status")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load notification events: ${error.message}`);
  return (data ?? []) as unknown as { event: string; status: AdminNotificationStatus }[];
}
