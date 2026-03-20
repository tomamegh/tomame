"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { NotificationListResponse, AdminNotificationListResponse } from "../types";

export const notificationKeys = {
  all: ["notifications"] as const,
  user: () => [...notificationKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string; channel?: string }) =>
    [...notificationKeys.all, "admin", filters ?? {}] as const,
};

/** List notifications for the current user */
export function useNotifications() {
  return useQuery<ApiSuccessResponse<NotificationListResponse>, Error, NotificationListResponse>({
    queryKey: notificationKeys.user(),
    queryFn: () => apiFetch<ApiSuccessResponse<NotificationListResponse>>("/api/notifications"),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}

/** Admin: list all notifications with optional filters */
export function useAdminNotifications(filters?: {
  status?: string;
  userId?: string;
  channel?: string;
}) {
  return useQuery<ApiSuccessResponse<AdminNotificationListResponse>, Error, AdminNotificationListResponse>({
    queryKey: notificationKeys.admin(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.userId) params.set("userId", filters.userId);
      if (filters?.channel) params.set("channel", filters.channel);
      const qs = params.toString();
      return apiFetch<ApiSuccessResponse<AdminNotificationListResponse>>(
        `/api/admin/notifications${qs ? `?${qs}` : ""}`,
      );
    },
    select: (res) => res.data,
    staleTime: 30_000,
  });
}
