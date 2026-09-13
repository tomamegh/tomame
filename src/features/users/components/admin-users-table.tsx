import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminTableScroller,
} from "@/components/layout/admin";
import type { PlatformUser } from "@/features/users/types";

import { formatJoined, roleBadge, userDisplayName, userInitials } from "./admin-user-format";

/**
 * The accounts table.
 *
 * A server component. It replaces a TanStack client table with sorting,
 * faceted filters, a global search box and row-level dropdown actions — all of
 * it hydrated on every visit to administer a list that, for a platform at this
 * stage, is a few hundred rows. Filtering by role is a link now (`?role=admin`),
 * which is a URL an admin can bookmark and share, and costs no JavaScript.
 *
 * Role changes are NOT offered from a row. They happen on the detail screen
 * behind a confirmation that states what the role grants — a per-row dropdown
 * makes the single most consequential write in the product a two-click accident.
 */
export function AdminUsersTable({ users }: { users: readonly PlatformUser[] }) {
  return (
    <AdminTableScroller>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={ADMIN_TH}>
              Account
            </th>
            <th scope="col" className={ADMIN_TH}>
              Email
            </th>
            <th scope="col" className={ADMIN_TH}>
              Role
            </th>
            <th scope="col" className={ADMIN_TH}>
              Joined
            </th>
            <th scope="col" className={ADMIN_TH}>
              Last signed in
            </th>
            <th scope="col" className={ADMIN_TH}>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const badge = roleBadge(user.profile.role);
            const joined = formatJoined(user.created_at);
            const lastSignIn = formatJoined(user.last_sign_in_at);

            return (
              <tr key={user.id} className={ADMIN_TR}>
                <td className={ADMIN_TD}>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="flex items-center gap-3 font-semibold text-tm-ink"
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tm-tint text-[12px] leading-none font-bold text-tm-ink"
                    >
                      {userInitials(user.profile, user.email)}
                    </span>
                    <span className="truncate">
                      {userDisplayName(user.profile, user.email)}
                    </span>
                  </Link>
                </td>
                <td className={`${ADMIN_TD} text-tm-text-2`}>{user.email ?? "—"}</td>
                <td className={ADMIN_TD}>
                  <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                </td>
                <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                  {joined ?? "—"}
                </td>
                <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                  {/*
                    Supabase leaves `last_sign_in_at` null for an account created
                    by an admin that nobody has used yet. An em dash, never
                    "never" — the dash is the table's own word for "no value".
                  */}
                  {lastSignIn ?? "—"}
                </td>
                <td className={`${ADMIN_TD} text-right`}>
                  <Link
                    href={`/admin/users/${user.id}`}
                    aria-label={`Open ${userDisplayName(user.profile, user.email)}`}
                    className="inline-flex text-tm-text-3 transition-colors hover:text-tm-ink"
                  >
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </AdminTableScroller>
  );
}
