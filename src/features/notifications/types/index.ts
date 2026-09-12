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
  /** NULL means unread. Set by the read / read-all endpoints (migration 041). */
  read_at: string | null;
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
  /** NULL means unread — the nav bell's dot counts these. */
  read_at: string | null;
}

export interface NotificationList {
  notifications: Notification[];
  /** Total notifications for the user — unchanged meaning, kept for callers. */
  count: number;
  /** How many of those are unread (`read_at IS NULL`). */
  unread_count: number;
}

export interface NotificationListResponse {
  notifications: Notification[];
  /** Total notifications for the user — unchanged meaning, kept for callers. */
  count: number;
  /** How many of those are unread. Bundled here so the app shell needs one
   *  request to render both the list and the bell's dot. */
  unread_count: number;
}

/** Result of marking a single notification read. */
export interface MarkNotificationReadResult {
  id: string;
  read_at: string;
  /** True when the notification was already read — `read_at` was not moved. */
  already_read: boolean;
}

/** Result of marking every unread notification read. */
export interface MarkAllNotificationsReadResult {
  /** Rows actually transitioned from unread to read by this call. */
  updated: number;
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
