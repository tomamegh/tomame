"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { SupportedStoreListResponse } from "@/features/stores/types";

export const storeKeys = {
  enabled: ["stores", "supported", "enabled"] as const,
};

/** Fetch the list of enabled supported stores from the public API. */
export function useEnabledStores() {
  return useQuery<SupportedStoreListResponse>({
    queryKey: storeKeys.enabled,
    queryFn: async () => {
      const res =
        await apiFetch<ApiSuccessResponse<SupportedStoreListResponse>>(
          "/api/stores",
        );
      return res.data;
    },
    staleTime: 5 * 60 * 1000, // treat as fresh for 5 minutes
  });
}
