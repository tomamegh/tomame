"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import type { InitializePaymentRequest, InitializePaymentResponse } from "../types";
import type { MomoPaymentState } from "../momo";

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

// ── Mobile Money prompt (Seamless Roadmap, Initiative 1) ────────────────────

export interface StartMomoPaymentRequest {
  orderGroupId?: string;
  orderId?: string;
  channel: string;
  phone: string;
  remember: boolean;
}

/** Sends the MoMo prompt straight to the phone. The amount is never sent from here. */
export function useStartMomoPayment() {
  return useMutation<MomoPaymentState, Error, StartMomoPaymentRequest>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<MomoPaymentState>>("/api/payments/momo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => res.data),
  });
}

/** Where a prompt stands; the server settles it once Paystack has an outcome. */
export function fetchMomoPaymentState(reference: string): Promise<MomoPaymentState> {
  return apiFetch<ApiSuccessResponse<MomoPaymentState>>(`/api/payments/momo/${encodeURIComponent(reference)}`).then(
    (res) => res.data,
  );
}

/** The network's code, for a prompt that asked for one. */
export function useSubmitMomoOtp() {
  return useMutation<MomoPaymentState, Error, { reference: string; otp: string }>({
    mutationFn: ({ reference, otp }) =>
      apiFetch<ApiSuccessResponse<MomoPaymentState>>(`/api/payments/momo/${encodeURIComponent(reference)}/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      }).then((res) => res.data),
  });
}
