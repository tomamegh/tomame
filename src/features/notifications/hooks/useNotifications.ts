"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type {
  NotificationListResponse,
  AdminNotificationListResponse,
  MarkNotificationReadResult,
  MarkAllNotificationsReadResult,
} from "../types";

export const notificationKeys = {
  all: ["notifications"] as const,
  user: () => [...notificationKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string; channel?: string }) =>
    [...notificationKeys.all, "admin", filters ?? {}] as const,
};

/**
 * List notifications for the current user.
 *
 * `enabled` lets a caller defer the request until it is actually needed — the
 * nav bell passes `false` until its panel opens, because the unread dot is
 * already server-rendered and fetching the whole list on every page load for
 * every signed-in user would be a round trip nobody reads.
 */
export function useNotifications(options?: { enabled?: boolean }) {
  return useQuery<ApiSuccessResponse<NotificationListResponse>, Error, NotificationListResponse>({
    queryKey: notificationKeys.user(),
    queryFn: () => apiFetch<ApiSuccessResponse<NotificationListResponse>>("/api/notifications"),
    select: (res) => res.data,
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Unread count for the nav bell's dot. Reads the same cached query as
 * `useNotifications`, so the shell issues one request, not two.
 */
export function useUnreadNotificationCount(options?: { enabled?: boolean }) {
  return useQuery<ApiSuccessResponse<NotificationListResponse>, Error, number>({
    queryKey: notificationKeys.user(),
    queryFn: () => apiFetch<ApiSuccessResponse<NotificationListResponse>>("/api/notifications"),
    select: (res) => res.data.unread_count,
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

/** Mark one notification read. Idempotent server-side. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation<MarkNotificationReadResult, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiFetch<ApiSuccessResponse<MarkNotificationReadResult>>(
        `/api/notifications/${id}/read`,
        { method: "PATCH" },
      ).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/** Mark every unread notification read. Idempotent server-side. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation<MarkAllNotificationsReadResult, Error, void>({
    mutationFn: () =>
      apiFetch<ApiSuccessResponse<MarkAllNotificationsReadResult>>(
        "/api/notifications/read-all",
        { method: "POST" },
      ).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
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
