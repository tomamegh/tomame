// ── Database row type ─────────────────────────────────────────────────────────

export interface PlatformNotification {
  id: string;
  user_id: string;
  channel: "email" | "whatsapp";
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  created_at: string;
  sent_at: string | null;
}
// ── Domain types ──────────────────────────────────────────────────────────────

export type NotificationStatus = "pending" | "sent" | "failed";
export type NotificationChannel = "email" | "whatsapp";

export interface Notification {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  event: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  created_at: string;
  sent_at: string | null;
}

export interface NotificationList {
  notifications: Notification[];
  count: number;
}

export interface NotificationListResponse {
  notifications: Notification[];
  count: number;
}

export interface NotificationWithUser extends Notification {
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface AdminNotificationListResponse {
  notifications: NotificationWithUser[];
  count: number;
}
