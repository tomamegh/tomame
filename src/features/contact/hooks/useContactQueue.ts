"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ContactMessageRow, ContactMessageStatus } from "@/db/queries/contact-messages";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * The contact queue's data, lifted out of the component.
 *
 * It was declared inline in `contact-queue.tsx`, which meant the query key and
 * the invalidation lived in two places three hundred lines apart — the assisted
 * queue has had them in a hook since it was written, and these two screens
 * should not be built differently.
 */

const QUEUE_KEY = "contact-queue";

/** Oldest first — the server orders it; this does not re-sort. */
export function useContactQueue(status: ContactMessageStatus | "all") {
  return useQuery<ContactMessageRow[]>({
    queryKey: [QUEUE_KEY, status] as const,
    queryFn: async () => {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await apiFetch<ApiSuccessResponse<ContactMessageRow[]>>(
        `/api/admin/contact-messages${qs}`,
      );
      return res.data;
    },
  });
}

export interface MoveContactMessageInput {
  id: string;
  /** The status the admin SAW. The server guards on it, so two of them cannot both claim a message. */
  from: ContactMessageStatus;
  status: "answered" | "closed";
  /** Omitted entirely when untouched, so a blank box cannot wipe somebody else's note. */
  note?: string | null;
}

export function useMoveContactMessage() {
  const queryClient = useQueryClient();

  return useMutation<ContactMessageRow, Error, MoveContactMessageInput>({
    mutationFn: async ({ id, ...body }) => {
      const res = await apiFetch<ApiSuccessResponse<ContactMessageRow>>(
        `/api/admin/contact-messages/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUEUE_KEY] }),
  });
}
