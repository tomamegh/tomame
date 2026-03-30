"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ExtractionResult } from "@/features/extraction/types";
import type { ApiSuccessResponse } from "@/types/api";

/** Extract product data from a URL */
export function useExtractProduct() {
  return useMutation<ExtractionResult, Error, { product_url: string }>({
    mutationFn: async (data) => {
      const response = await apiFetch<ApiSuccessResponse<ExtractionResult>>(
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
