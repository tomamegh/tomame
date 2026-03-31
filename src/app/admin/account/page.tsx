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

export default function AdminAccountPage() {
  const { isLoading: authLoading } = useSession();
  const { data: user, isLoading: profileLoading } = useProfile();
  const isLoading = authLoading || profileLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Account Settings</h1>
        <p className="text-sm text-stone-600 mt-1">
          Manage your profile, security settings, and account preferences
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6 grid md:grid-col-2 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
          {/* Profile Info Card */}
          <ProfileInfoCard user={user ?? null} isLoading={isLoading} />

          {/* Edit Profile Card */}
          <EditProfileCard user={user ?? null} />
          </div>

          <div className="space-y-6">
          {/* Security Settings Card */}
          <SecuritySettingsCard />

          {/* Account Activity Card */}
          <AccountActivityCard />
          </div>

        </div>
      )}
    </div>
  );
}
