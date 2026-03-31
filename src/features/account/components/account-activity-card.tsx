"use client";

import { Activity, LogIn, User, Lock, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/features/account/hooks/useActivity";

const ACTION_LABELS: Record<string, string> = {
  user_logged_in: "Signed in to your account",
  user_registered: "Account created",
  user_profile_updated: "Profile information updated",
  user_password_changed: "Password changed",
  password_reset_requested: "Password reset requested",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  user_logged_in: <LogIn className="h-4 w-4" />,
  user_registered: <UserPlus className="h-4 w-4" />,
  user_profile_updated: <User className="h-4 w-4" />,
  user_password_changed: <Lock className="h-4 w-4" />,
  password_reset_requested: <Lock className="h-4 w-4" />,
};

const ACTION_BADGE_VARIANTS: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  user_logged_in: "default",
  user_registered: "default",
  user_profile_updated: "secondary",
  user_password_changed: "outline",
  password_reset_requested: "outline",
};

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function AccountActivityCard() {
  const { data: activity, isLoading } = useActivity();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Account Activity
        </CardTitle>
        <CardDescription>Recent activity on your account</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : !activity || activity.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-8 w-8 text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-600">No activity yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-4 rounded-lg border border-stone-200 p-4 hover:bg-stone-50 transition-colors"
              >
                <div className="mt-1 shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    {ACTION_ICONS[item.action] ?? (
                      <Activity className="h-4 w-4" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-stone-900">
                      {formatActionLabel(item.action)}
                    </p>
                    <Badge
                      variant={
                        ACTION_BADGE_VARIANTS[item.action] ?? "outline"
                      }
                      className="text-xs"
                    >
                      {item.entity_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    {formatRelativeTime(item.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
