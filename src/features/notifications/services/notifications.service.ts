import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";
import type {
  Notification,
  NotificationListResponse,
  NotificationWithUser,
  AdminNotificationListResponse,
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

async function getAllNotifications(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string; channel?: string },
): Promise<NotificationWithUser[]> {
  let query = client
    .from("notifications")
    .select("*, profiles(id, email, first_name, last_name)")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.userId) query = query.eq("user_id", filters.userId);
  if (filters?.channel) query = query.eq("channel", filters.channel);

  const { data, error } = await query;

  if (error) {
    logger.error("getAllNotifications failed", { error: error.message });
    return [];
  }

  return (data ?? []).map((row: Notification & { profiles: NotificationWithUser["user"] }) => ({
    ...row,
    user: row.profiles ?? null,
  }));
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function listUserNotifications(
  user: PlatformUser,
): Promise<NotificationListResponse> {
  const notifications = await getNotificationsByUserId(
    createAdminClient(),
    user.id,
  );
  return { notifications, count: notifications.length };
}

export async function listAllNotifications(
  user: PlatformUser,
  filters?: { status?: string; userId?: string; channel?: string },
): Promise<AdminNotificationListResponse> {
  if (user.profile.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const notifications = await getAllNotifications(createAdminClient(), filters);
  return { notifications, count: notifications.length };
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
