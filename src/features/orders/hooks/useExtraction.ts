"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ExtractionResult } from "@/features/extraction/extraction.service";

export type ExtractionResponse = ExtractionResult & { resolvedUrl?: string };

/** Extract product data from a URL */
export function useExtractProduct() {
  return useMutation<ExtractionResponse, Error, { productUrl: string }>({
    mutationFn: (data) =>
      apiFetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}
