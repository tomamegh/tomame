import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getNotificationsByUserId,
  getAllNotifications,
} from "@/features/notifications/notifications.queries";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { DbNotification } from "@/types/db";

export interface NotificationResponse {
  id: string;
  userId: string;
  channel: string;
  event: string;
  payload: Record<string, unknown>;
  status: string;
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
    channel: n.channel,
    event: n.event,
    payload: n.payload,
    status: n.status,
    createdAt: n.created_at,
    sentAt: n.sent_at,
  };
}

/**
 * List notifications for the authenticated user.
 */
export async function listUserNotifications(
  user: AuthenticatedUser
): Promise<ServiceResult<NotificationListResponse>> {
  const notifications = await getNotificationsByUserId(supabaseAdmin, user.id);

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

  const notifications = await getAllNotifications(supabaseAdmin, filters);

  return {
    success: true,
    data: {
      notifications: notifications.map(toResponse),
      count: notifications.length,
    },
  };
}
