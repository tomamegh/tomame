"use client";

import { useQuery } from "@tanstack/react-query";
import type { NotificationListResponse } from "@/features/notifications/services/notifications.service";

// ── Query keys ───────────────────────────────────────────────

export const notificationKeys = {
  all: ["notifications"] as const,
  user: () => [...notificationKeys.all, "user"] as const,
  admin: (filters?: { status?: string; userId?: string; channel?: string }) =>
    [...notificationKeys.all, "admin", filters ?? {}] as const,
};

// ── Helper ───────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

// ── User hooks ───────────────────────────────────────────────

/** List notifications for the current user */
export function useNotifications() {
  return useQuery<NotificationListResponse>({
    queryKey: notificationKeys.user(),
    queryFn: () => apiFetch("/api/notifications"),
  });
}

// ── Admin hooks ──────────────────────────────────────────────

/** Admin: list all notifications with optional filters */
export function useAdminNotifications(filters?: {
  status?: string;
  userId?: string;
  channel?: string;
}) {
  return useQuery<NotificationListResponse>({
    queryKey: notificationKeys.admin(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.userId) params.set("userId", filters.userId);
      if (filters?.channel) params.set("channel", filters.channel);
      const qs = params.toString();
      return apiFetch(`/api/admin/notifications${qs ? `?${qs}` : ""}`);
    },
  });
}
