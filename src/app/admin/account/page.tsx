import { notFound } from "next/navigation";

import { AdminCard, AdminPage } from "@/components/layout/admin";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { getAccountProfile } from "@/features/account/services/account-profile.service";
import { AccountProfilePanel } from "@/features/account/components/account-profile-panel";
import { AccountSecurityPanel } from "@/features/account/components/account-security-panel";
import { roleGrantSummary } from "@/features/users/components/admin-user-format";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account · Tomame admin",
  description: "Your own profile and password.",
};

/**
 * `/admin/account` — the administrator's own profile and password.
 *
 * WHAT CHANGED. This was a client component that mounted four PRE-v2 cards
 * (`ProfileInfoCard`, `EditProfileCard`, `SecuritySettingsCard`,
 * `AccountActivityCard`) behind a skeleton and two hooks. Those cards were the
 * old account screen, kept alive solely because this page still imported them —
 * their own barrel says as much — while `/app/account` moved to the v2 panels.
 * Two implementations of "change your name" is one too many, and the one an
 * admin saw was the abandoned one.
 *
 * It is now a server component rendering the SAME v2 panels the customer
 * account screen uses. An admin is a person with an account; there is no reason
 * for their profile form to be a different piece of software from everybody
 * else's.
 *
 * What is deliberately NOT here: this admin's own role. Role changes go through
 * `/admin/users/[id]`, where the change is confirmed, audited and written by the
 * server with a service-role client. A shortcut on this page would be a way to
 * demote yourself with one click on a screen about changing your name.
 */
export default async function AdminAccountPage() {
  const user = await getAuthenticatedUser();
  // `src/proxy.ts` gates `/admin`; this covers the session that ended between
  // that check and this render.
  if (!user || user.profile.role !== "admin") notFound();

  const profile = await getAccountProfile(user.id, user.email ?? null);

  return (
    <AdminPage
      title="Your account"
      blurb="Your own profile and password. Everything here is the same form customers use for theirs."
    >
      <AdminCard index={0} title="Your access" >
        <p className="max-w-[70ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">
          {roleGrantSummary(user.profile.role)} Roles are changed from a user&rsquo;s own page
          under Users, where the change is confirmed and written to the audit log.
        </p>
      </AdminCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <AccountProfilePanel
          profile={profile}
          blurb="Your name, contact number and bio. The sign-in email is shown but not editable — changing it is an auth flow with its own confirmation mail."
        />
        <AccountSecurityPanel
          blurb="Change your password. The current one is verified before a new one is accepted."
          lastSignInAt={user.last_sign_in_at ?? null}
          createdAt={user.created_at ?? null}
        />
      </div>
    </AdminPage>
  );
}
