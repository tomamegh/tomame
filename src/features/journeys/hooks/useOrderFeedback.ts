"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { OrderFeedback } from "@/features/feedback/types";
import type { SubmitOrderFeedbackInput } from "@/features/feedback/schema";
import { ApiFetchError, apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * What the customer has already said about their parcel, and what came back.
 *
 * Read from the browser rather than baked into the detail view model: the
 * feedback loop is the one part of this screen that changes WHILE the customer
 * is looking at it — they speak, we answer — and a server-rendered snapshot
 * would go stale the moment they tapped. The view model stays what it is
 * (`journey-detail.service.ts` is untouched); this is the only thing on the
 * screen that fetches.
 *
 * The route authorises by ownership of the order, so there is nothing to gate
 * here beyond having an id.
 */
export function orderFeedbackQueryKey(orderId: string) {
  return ["orders", orderId, "feedback"] as const;
}

export function useOrderFeedback(orderId: string) {
  return useQuery({
    queryKey: orderFeedbackQueryKey(orderId),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<OrderFeedback[]>>(`/api/orders/${orderId}/feedback`),
    select: (res) => res.data,
    // The queue moves at human speed; re-reading on every focus would be noise.
    staleTime: 30_000,
  });
}

/**
 * Say something about the parcel.
 *
 * The new row is written into the cache immediately AND the query is
 * invalidated: the first makes the screen reflect what was just said without a
 * round trip, the second makes the server's own copy — including a `status` an
 * admin may already have moved — the one that survives.
 *
 * `onSuccess` returns the invalidation promise so the mutation stays pending
 * until the refetch lands, which keeps the button from flickering back to
 * "ready" a beat before the answer appears.
 */
export function useSubmitOrderFeedback(orderId: string) {
  const queryClient = useQueryClient();
  const key = orderFeedbackQueryKey(orderId);

  return useMutation<OrderFeedback, Error, SubmitOrderFeedbackInput>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<OrderFeedback>>(`/api/orders/${orderId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => res.data),
    onSuccess: (row) => {
      queryClient.setQueryData<ApiSuccessResponse<OrderFeedback[]>>(key, (previous) => ({
        success: true,
        data: [row, ...(previous?.data ?? [])],
      }));
      return queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * One wording for a failed submission, shared by the confirm tap and the
 * dialog.
 *
 * 429 is the route's `assisted` budget — six an hour, because every row is work
 * for a person at a warehouse. It is answered with the reason rather than the
 * status, so a customer correcting themselves twice is not left staring at
 * "Request failed".
 */
export function notifyFeedbackError(error: Error): void {
  if (error instanceof ApiFetchError && error.status === 429) {
    toast.error({
      title: "One moment",
      description: "You have sent a few of these. Give us a moment to look.",
    });
    return;
  }
  toast.error({ title: "Could not send that", description: error.message });
}
