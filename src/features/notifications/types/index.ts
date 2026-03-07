export type NotificationStatus = "pending" | "sent" | "failed";
export type NotificationChannel = "email" | "whatsapp";

export interface Notification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  event: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  createdAt: string;
  sentAt: string | null;
}

export interface NotificationList {
  notifications: Notification[];
  count: number;
}
