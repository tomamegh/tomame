"use client";

import { Mail, Calendar, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PlatformUser } from "@/features/users/types";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfileInfoCardProps {
  user: PlatformUser | null;
  isLoading?: boolean;
}

export function ProfileInfoCard({ user, isLoading }: ProfileInfoCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your profile details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return null;
  }

  const displayName = user.profile?.first_name || user.email?.split("@")[0] || "User";
  const initials = (
    user.profile?.first_name?.[0] + (user.profile?.last_name?.[0] || "")
  ).toUpperCase();
  const roleLabel = user.profile?.role === "admin" ? "Administrator" : "User";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Information</CardTitle>
        <CardDescription>Your profile details and account status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Avatar and Name */}
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage
              src={user.user_metadata?.avatar_url}
              alt={displayName}
            />
            <AvatarFallback className="bg-linear-to-br from-blue-500 to-purple-600 text-white font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {user.profile?.role === "admin" && (
            <div className="flex-1">
            <p className="text-lg font-semibold text-stone-900">
              {user.profile?.first_name && user.profile?.last_name
                ? `${user.profile.first_name} ${user.profile.last_name}`
                : displayName}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Shield className="h-3 w-3" />
                {roleLabel}
              </Badge>
            </div>
          </div>
          )}
        </div>

        {/* Email */}
        <div className="flex items-start gap-3 border-t pt-6">
          <Mail className="h-5 w-5 text-stone-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-stone-700">Email Address</p>
            <p className="text-sm text-stone-600 mt-0.5">{user.email}</p>
            {user.email_confirmed_at && (
              <p className="text-xs text-green-600 mt-1">✓ Verified</p>
            )}
          </div>
        </div>

        {/* Account Created */}
        <div className="flex items-start gap-3 border-t pt-6">
          <Calendar className="h-5 w-5 text-stone-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-stone-700">Account Created</p>
            <p className="text-sm text-stone-600 mt-0.5">
              {user.created_at
                ? new Date(user.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "N/A"}
            </p>
          </div>
        </div>

        {/* Last Sign In */}
        {user.last_sign_in_at && (
          <div className="flex items-start gap-3 border-t pt-6">
            <Calendar className="h-5 w-5 text-stone-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-700">Last Sign In</p>
              <p className="text-sm text-stone-600 mt-0.5">
                {new Date(user.last_sign_in_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
