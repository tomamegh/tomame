"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";

import type { CustomerAnnouncement } from "../types";

export const announcementKeys = { mine: ["announcements", "mine"] as const };

/** The signed-in customer's messages from Tomame they have not dismissed (119). */
export function useAnnouncements(options?: { enabled?: boolean }) {
  return useQuery<ApiSuccessResponse<CustomerAnnouncement[]>, Error, CustomerAnnouncement[]>({
    queryKey: announcementKeys.mine,
    queryFn: () => apiFetch<ApiSuccessResponse<CustomerAnnouncement[]>>("/api/announcements"),
    select: (res) => res.data,
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

/** Seen (the pop-up showed; it stays in the bell) or dismissed (gone). */
export function useAnnouncementReceipt() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { id: string; dismissed: boolean }>({
    mutationFn: ({ id, dismissed }) =>
      apiFetch(`/api/announcements/${id}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: announcementKeys.mine }),
  });
}
