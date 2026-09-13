"use client";

import { useQuery } from "@tanstack/react-query";

import type { AdminQueueCounts } from "@/db/queries/admin-queues";
import { apiFetch } from "@/lib/auth/api-helpers";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import type { ApiSuccessResponse } from "@/types/api";

export const queueCountKeys = { all: ["admin", "queue-counts"] as const };

/**
 * How often the sidebar re-asks what is waiting.
 *
 * A minute, not the two seconds the paste queue polls at: nobody is watching a
 * badge for a live update, and an admin leaving a tab open all day must not
 * spend four count queries every two seconds to be told the same four zeros.
 */
export const QUEUE_COUNT_POLL_MS = 60_000;

/**
 * The sidebar's badge numbers.
 *
 * Polls only while the tab is actually being looked at (`useVisibleInterval`),
 * and catches up immediately on becoming visible again — an admin returning
 * from their mail client should see the request that arrived meanwhile, not
 * wait out the next minute.
 */
export function useQueueCounts() {
  const query = useQuery<AdminQueueCounts>({
    queryKey: queueCountKeys.all,
    queryFn: async () => {
      const res = await apiFetch<ApiSuccessResponse<AdminQueueCounts>>(
        "/api/admin/queue-counts",
      );
      return res.data;
    },
    staleTime: QUEUE_COUNT_POLL_MS,
  });

  const { refetch } = query;
  useVisibleInterval(() => void refetch(), QUEUE_COUNT_POLL_MS, true);

  return query;
}
