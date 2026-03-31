"use client";

import { useSession } from "@/features/auth/providers/auth-provider";
import { useProfile } from "@/features/account/hooks/useProfile";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ProfileInfoCard,
  EditProfileCard,
  SecuritySettingsCard,
  AccountActivityCard,
} from "@/features/account/components";

export default function AccountPage() {
  const { isLoading: authLoading } = useSession();
  const { data: user, isLoading: profileLoading } = useProfile();
  const isLoading = authLoading || profileLoading;

  return (
    <div className=" bg-stone-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-900">
            Account Settings
          </h1>
          <p className="mt-2 text-base text-stone-600">
            Manage your profile, security settings, and account preferences
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Profile Info Card */}
            <ProfileInfoCard user={user ?? null} isLoading={isLoading} />

            {/* Edit Profile Card */}
            <EditProfileCard user={user ?? null} />

            {/* Security Settings Card */}
            <SecuritySettingsCard />

            {/* Account Activity Card */}
            <AccountActivityCard />
          </div>
        )}
      </div>
    </div>
  );
}
