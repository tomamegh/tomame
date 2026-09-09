"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { Quote } from "@/features/extraction/types";
import type { ApiSuccessResponse } from "@/types/api";

/** Extract product data from a URL and get a server-priced quote */
export function useExtractProduct() {
  return useMutation<Quote, Error, { product_url: string }>({
    mutationFn: async (data) => {
      const response = await apiFetch<ApiSuccessResponse<Quote>>(
        "/api/products/extract",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      return response.data;
    },
  });
}
