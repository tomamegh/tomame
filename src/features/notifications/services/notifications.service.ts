import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { DbNotification } from "@/types/db";

async function getNotificationsByUserId(
  client: SupabaseClient,
  userId: string
): Promise<DbNotification[]> {
  const { data, error } = await client
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("getNotificationsByUserId failed", { userId, error: error.message });
    return [];
  }
  return (data ?? []) as DbNotification[];
}

async function getAllNotifications(
  client: SupabaseClient,
  filters?: { status?: string; userId?: string; channel?: string }
): Promise<DbNotification[]> {
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
  return (data ?? []) as DbNotification[];
}

export interface NotificationResponse {
  id: string;
  userId: string;
  channel: "email" | "whatsapp";
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  createdAt: string;
  sentAt: string | null;
}

export interface NotificationListResponse {
  notifications: NotificationResponse[];
  count: number;
}

function toResponse(n: DbNotification): NotificationResponse {
  return {
    id: n.id,
    userId: n.user_id,
    channel: n.channel as "email" | "whatsapp",
    event: n.event,
    payload: n.payload,
    status: n.status as "pending" | "sent" | "failed",
    createdAt: n.created_at,
    sentAt: n.sent_at,
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * List notifications for the authenticated user.
 */
export async function listUserNotifications(
  user: AuthenticatedUser
): Promise<ServiceResult<NotificationListResponse>> {
  const notifications = await getNotificationsByUserId(createAdminClient(), user.id);

  return {
    success: true,
    data: {
      notifications: notifications.map(toResponse),
      count: notifications.length,
    },
  };
}

/**
 * Admin: list all notifications with optional filters.
 */
export async function listAllNotifications(
  user: AuthenticatedUser,
  filters?: { status?: string; userId?: string; channel?: string }
): Promise<ServiceResult<NotificationListResponse>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const notifications = await getAllNotifications(createAdminClient(), filters);

  return {
    success: true,
    data: {
      notifications: notifications.map(toResponse),
      count: notifications.length,
    },
  };
}
