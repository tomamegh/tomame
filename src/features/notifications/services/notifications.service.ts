import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/types/domain";
import { Notification, NotificationListResponse } from "../types";

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
): Promise<Notification[]> {
  let query = client
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.userId) query = query.eq("user_id", filters.userId);
  if (filters?.channel) query = query.eq("channel", filters.channel);

  const { data, error } = await query;

  if (error) {
    logger.error("getAllNotifications failed", { error: error.message });
    return [];
  }
  return (data ?? []) as Notification[];
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function listUserNotifications(
  user: AuthenticatedUser,
): Promise<NotificationListResponse> {
  const notifications = await getNotificationsByUserId(
    createAdminClient(),
    user.id,
  );
  return { notifications, count: notifications.length };
}

export async function listAllNotifications(
  user: AuthenticatedUser,
  filters?: { status?: string; userId?: string; channel?: string },
): Promise<NotificationListResponse> {
  if (user.role !== "admin") {
    throw new APIError(403, "Admin access required");
  }

  const notifications = await getAllNotifications(createAdminClient(), filters);
  return { notifications, count: notifications.length };
}
