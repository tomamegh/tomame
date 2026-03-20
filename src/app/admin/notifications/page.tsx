import { AdminNotificationsTable } from "@/features/notifications/components/admin-notifications-table/data-table";

export default function AdminNotificationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Notifications</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          All platform notifications sent to users and admins
        </p>
      </div>
      <AdminNotificationsTable />
    </div>
  );
}
