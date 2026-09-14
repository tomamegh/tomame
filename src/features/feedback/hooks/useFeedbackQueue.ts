"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { OrderFeedbackRow, OrderFeedbackStatus } from "@/db/queries/order-feedback";
import type { OrderHoldRow } from "@/db/queries/order-holds";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * The parcel-feedback queue's data, lifted out of the component — the shape both
 * older queues settled on (`useContactQueue`, `useAssistedQueue`), so the query
 * key and its invalidation live next to each other rather than three hundred
 * lines apart.
 *
 * Four calls against routes that already exist and are not changed here:
 * the queue read, the guarded transition, and the two halves of the hold.
 */

const QUEUE_KEY = "order-feedback-queue";

/** Oldest first — the server orders it and caps at 200; this does not re-sort. */
export function useFeedbackQueue(status: OrderFeedbackStatus | "all") {
  return useQuery<OrderFeedbackRow[]>({
    queryKey: [QUEUE_KEY, status] as const,
    queryFn: async () => {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await apiFetch<ApiSuccessResponse<OrderFeedbackRow[]>>(
        `/api/admin/order-feedback${qs}`,
      );
      return res.data;
    },
  });
}

export interface MoveOrderFeedbackInput {
  id: string;
  /**
   * The status this admin SAW on screen. The server guards the UPDATE on it, so
   * two admins working the queue at once cannot both claim one customer — the
   * second is answered 409 rather than silently overwriting the first's answer.
   */
  from: OrderFeedbackStatus;
  status: "in_review" | "resolved" | "dismissed";
  /** Omitted entirely when untouched, so a blank box cannot wipe somebody else's words. */
  resolution?: string | null;
}

export function useMoveOrderFeedback() {
  const queryClient = useQueryClient();

  return useMutation<OrderFeedbackRow, Error, MoveOrderFeedbackInput>({
    mutationFn: async ({ id, ...body }) => {
      const res = await apiFetch<ApiSuccessResponse<OrderFeedbackRow>>(
        `/api/admin/order-feedback/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return res.data;
    },
    // Settled rather than success: a 409 is exactly the case where this admin's
    // copy of the row is stale, so the refetch matters most when the write
    // failed.
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUEUE_KEY] }),
  });
}

export interface HoldOrderParams {
  orderId: string;
  /** REQUIRED, 3–500 chars. The database refuses a hold with no reason. */
  reason: string;
  /** The objection that prompted it, for the audit trail. Context, not authority. */
  feedbackId?: string | null;
}

/**
 * Stop the parcel.
 *
 * Its own action, never a side effect of answering the customer: feedback never
 * pauses anything on its own, and an admin decides per case. Nothing about the
 * feedback row changes when an order is held, so this invalidates nothing — the
 * screens that read hold state are server-rendered and re-read on navigation.
 */
export function useHoldOrder() {
  return useMutation<OrderHoldRow, Error, HoldOrderParams>({
    mutationFn: async ({ orderId, reason, feedbackId }) => {
      const res = await apiFetch<ApiSuccessResponse<OrderHoldRow>>(
        `/api/admin/orders/${orderId}/hold`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, ...(feedbackId ? { feedback_id: feedbackId } : {}) }),
        },
      );
      return res.data;
    },
  });
}

export interface ReleaseHoldParams {
  orderId: string;
  /** What settled it. Optional — the audit row records the hold either way. */
  note?: string | null;
}

/** Let it go again. Separate from advancing the order, deliberately. */
export function useReleaseOrderHold() {
  return useMutation<OrderHoldRow, Error, ReleaseHoldParams>({
    mutationFn: async ({ orderId, note }) => {
      const res = await apiFetch<ApiSuccessResponse<OrderHoldRow>>(
        `/api/admin/orders/${orderId}/hold`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note?.trim() || null }),
        },
      );
      return res.data;
    },
  });
}
