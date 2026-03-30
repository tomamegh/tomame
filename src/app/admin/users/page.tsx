import { AdminUsersTable } from "@/features/users/components/admin-users-table";
import { UsersPageClient } from "./users-page-client";
import AddUserForm from "@/features/users/components/add-user-form";

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
        <AddUserForm />
      </div>
      <UsersPageClient />
      <AdminUsersTable />
    </div>
  );
}
