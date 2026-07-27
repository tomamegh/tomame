"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type {
  HubtelChannel,
  InitializePaymentResponse,
  PaymentStatusResponse,
} from "../types";

export function useInitializePayment() {
  return useMutation<
    InitializePaymentResponse,
    Error,
    { orderId: string; msisdn: string; channel: HubtelChannel }
  >({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<InitializePaymentResponse>>(
        "/api/payments/initialize",
        { method: "POST", body: JSON.stringify(body) },
      ).then((res) => res.data),
  });
}

/**
 * Poll a payment while the customer approves the mobile money prompt on their
 * handset. Polling stops as soon as the payment reaches a terminal state.
 */
export function usePaymentStatus(reference: string | null) {
  return useQuery<PaymentStatusResponse>({
    queryKey: ["payment-status", reference],
    enabled: Boolean(reference),
    refetchInterval: (query) => {
      const status = query.state.data?.payment.status;
      return status && status !== "pending" ? false : 4000;
    },
    queryFn: () =>
      apiFetch<ApiSuccessResponse<PaymentStatusResponse>>(
        `/api/payments/status?reference=${encodeURIComponent(reference!)}`,
      ).then((res) => res.data),
  });
}
