"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { InitializePaymentResponse } from "../types";

export function useInitializePayment() {
  return useMutation<InitializePaymentResponse, Error, { orderId: string }>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<InitializePaymentResponse>>(
        "/api/payments/initialize",
        { method: "POST", body: JSON.stringify(body) },
      ).then((res) => res.data),
  });
}
