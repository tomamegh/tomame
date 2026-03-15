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
