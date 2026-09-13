"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { InitializePaymentRequest, InitializePaymentResponse } from "../types";

/**
 * Starts a Paystack transaction. Takes either a single `orderId` (the legacy
 * per-order checkout) or the bag's `orderGroupId` plus the chosen channel —
 * the route validates which one it got. The amount is never sent from here.
 */
export function useInitializePayment() {
  return useMutation<InitializePaymentResponse, Error, InitializePaymentRequest>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<InitializePaymentResponse>>(
        "/api/payments/initialize",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      ).then((res) => res.data),
  });
}
