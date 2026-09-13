"use client";

import { useMutation } from "@tanstack/react-query";

import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { CreateAssistedRequestInput } from "../schema";
import type { AssistedRequest } from "../types";

/**
 * "Have a buyer sort it out." The server owns the link when a paste is named, so
 * the body carries only what the customer typed.
 */
export function useCreateAssistedRequest() {
  return useMutation<AssistedRequest, Error, CreateAssistedRequestInput>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<AssistedRequest>>("/api/assisted-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => res.data),
  });
}
