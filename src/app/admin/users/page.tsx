import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminStat,
} from "@/components/layout/admin";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listUsers } from "@/features/users/services/users.service";
import { AdminUsersTable } from "@/features/users/components/admin-users-table";
import AddUserForm from "@/features/users/components/add-user-form";
import { formatCount } from "@/features/admin/components/dashboard-format";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users · Tomame admin",
  description: "Everyone with a Tomame account.",
};

/**
 * `/admin/users` — every account, and who can reach the admin.
 *
 * A server component. `src/proxy.ts` already gates `/admin` on the admin role,
 * but the role is re-checked here before anything is read: this page is the one
 * that lists every customer on the platform, and defence in depth is the rule
 * the whole `/api/admin` namespace now follows after a dashboard endpoint
 * shipped with no check at all and served live revenue to anonymous callers on
 * production.
 *
 * The admin count leads the tiles. Administrators are the platform's blast
 * radius — the `admin` role opens every admin screen and every admin endpoint —
 * so how many there are is a number somebody should be able to see at a glance
 * and be surprised by.
 */

const ROLE_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "admin", label: "Admins" },
  { value: "user", label: "Customers" },
] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getAuthenticatedUser();
  if (!viewer || viewer.profile.role !== "admin") notFound();

  const params = await searchParams;
  const rawRole = Array.isArray(params.role) ? params.role[0] : params.role;
  const role = rawRole === "admin" || rawRole === "user" ? rawRole : undefined;

  const { users, count, stats } = await listUsers(createAdminClient(), viewer, { role });

  return (
    <AdminPage
      title="Users"
      blurb="Every account on the platform. Role changes happen on an account's own page, behind a confirmation that says what the role grants."
      action={<AddUserForm />}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label="Administrators"
          value={formatCount(stats.admins)}
          detail="Full access to every admin screen and endpoint"
          tone="coral"
          href="/admin/users?role=admin"
        />
        <AdminStat
          index={1}
          label="Customers"
          value={formatCount(stats.regularUsers)}
          detail="Storefront only"
          tone="neutral"
          href="/admin/users?role=user"
        />
        <AdminStat
          index={2}
          label="New this month"
          value={formatCount(stats.newThisMonth)}
          detail="Accounts created since the 1st"
          tone={stats.newThisMonth > 0 ? "green" : "muted"}
        />
        <AdminStat
          index={3}
          label="All accounts"
          value={formatCount(stats.total)}
          detail="Including accounts created by an admin"
          tone="neutral"
        />
      </div>

      <AdminCard
        index={1}
        title={role === "admin" ? "Administrators" : role === "user" ? "Customers" : "All accounts"}
        blurb={`${formatCount(count)} ${count === 1 ? "account" : "accounts"}, newest first.`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {ROLE_FILTERS.map((filter) => {
              const active = (role ?? "all") === filter.value;
              const href =
                filter.value === "all" ? "/admin/users" : `/admin/users?role=${filter.value}`;
              return (
                <Link
                  key={filter.value}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] leading-none font-semibold transition-colors",
                    active
                      ? "border-tm-coral/40 bg-tm-pill-bg text-tm-coral-strong"
                      : "border-tm-border bg-card text-tm-text-2 hover:bg-tm-paper",
                  )}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>
        }
        flush={users.length > 0}
      >
        {users.length === 0 ? (
          <AdminEmpty
            title={role ? "No accounts with this role" : "No accounts yet"}
            body={
              role === "admin"
                ? "Nobody currently holds the admin role. If that is unexpected, somebody has been demoted, and the change is in the audit log."
                : role === "user"
                  ? "Every account on the platform is an admin account. No customer has signed up yet."
                  : "Nobody has signed up and no account has been created by hand."
            }
          >
            {role ? (
              <Link
                href="/admin/users"
                className="text-[13px] leading-none font-semibold text-tm-coral-strong underline underline-offset-2"
              >
                Show everyone
              </Link>
            ) : null}
          </AdminEmpty>
        ) : (
          <AdminUsersTable users={users} />
        )}
      </AdminCard>
    </AdminPage>
  );
}
