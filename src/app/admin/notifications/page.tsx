import { AdminNotificationsList } from "@/features/notifications/components";

export default function AdminNotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Notifications</h1>
        <p className="text-stone-400 text-sm mt-1">
          Monitor all notification delivery status
        </p>
      </div>
      <AdminNotificationsList />
    </div>
  );
}
