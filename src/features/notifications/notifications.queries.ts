import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbNotification } from "@/types/db";
import { logger } from "@/lib/logger";

interface NotificationInsert {
  user_id: string;
  channel: "email" | "whatsapp";
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
}

export async function insertNotification(
  client: SupabaseClient,
  notification: NotificationInsert
): Promise<DbNotification | null> {
  const { data, error } = await client
    .from("notifications")
    .insert(notification)
    .select()
    .single();

  if (error) {
    logger.error("insertNotification failed", { error: error.message });
    return null;
  }
  return data as DbNotification;
}

export async function getNotificationsByUserId(
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

export async function getAllNotifications(
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

export async function updateNotificationStatus(
  client: SupabaseClient,
  notificationId: string,
  status: "sent" | "failed",
  sentAt?: string
): Promise<DbNotification | null> {
  const update: Record<string, unknown> = { status };
  if (sentAt) update.sent_at = sentAt;

  const { data, error } = await client
    .from("notifications")
    .update(update)
    .eq("id", notificationId)
    .select()
    .single();

  if (error) {
    logger.error("updateNotificationStatus failed", { notificationId, error: error.message });
    return null;
  }
  return data as DbNotification;
}
