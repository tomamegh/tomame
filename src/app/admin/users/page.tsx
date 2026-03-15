import { AdminUsersTable } from "@/features/users/components/admin-users-table";
import { AddUserDialog } from "@/features/users/components/add-user-dialog";
import { UsersPageClient } from "./users-page-client";

export default function AdminUsersPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Users</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Manage customer and admin accounts
          </p>
        </div>
        <AddUserDialog />
      </div>
      <UsersPageClient />
      <AdminUsersTable />
    </div>
  );
}
