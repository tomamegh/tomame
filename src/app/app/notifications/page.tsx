import { NotificationsList } from "@/features/notifications/components";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Notifications</h1>
        <p className="text-stone-400 text-sm mt-1">
          Updates on your orders and account activity
        </p>
      </div>
      <NotificationsList />
    </div>
  );
}
