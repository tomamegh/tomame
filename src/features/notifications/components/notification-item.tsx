import { BellIcon, MailIcon } from "lucide-react";
import type { Notification } from "../types";

const statusColor: Record<string, string> = {
  sent: "text-emerald-600",
  pending: "text-amber-600",
  failed: "text-red-600",
};

interface NotificationItemProps {
  notification: Notification;
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const Icon = notification.channel === "email" ? MailIcon : BellIcon;

  return (
    <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-stone-100 hover:shadow-sm transition-shadow">
      <div className="p-2 bg-stone-50 rounded-lg shrink-0">
        <Icon className="w-4 h-4 text-stone-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-stone-800 capitalize">
            {notification.event.replace(/_/g, " ")}
          </p>
          <span
            className={`text-xs font-semibold shrink-0 ${statusColor[notification.status] ?? ""}`}
          >
            {notification.status}
          </span>
        </div>
        <p className="text-xs text-stone-400 mt-0.5 capitalize">
          {notification.channel} ·{" "}
          {new Date(notification.createdAt).toLocaleDateString()}
          {notification.sentAt &&
            ` · Sent ${new Date(notification.sentAt).toLocaleDateString()}`}
        </p>
      </div>
    </div>
  );
}
