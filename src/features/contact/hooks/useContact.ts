"use client";

import { useMutation } from "@tanstack/react-query";

import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { ContactFormData } from "../schema";

/** Sends the contact form. Before this existed the form sent nothing at all. */
export function useSendContactMessage() {
  return useMutation<{ id: string }, Error, ContactFormData>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<{ id: string }>>("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => res.data),
  });
}
