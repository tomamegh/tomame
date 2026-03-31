"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import { useSession } from "@/features/auth/providers/auth-provider";
import type { PlatformUser } from "@/features/users/types";
import type { ApiSuccessResponse } from "@/types/api";

export const PROFILE_QUERY_KEY = ["me"] as const;

export function useProfile() {
  const { session } = useSession();

  return useQuery({
    queryKey: [...PROFILE_QUERY_KEY],
    queryFn: () =>
      apiFetch<ApiSuccessResponse<PlatformUser>>("/api/app/me"),
    enabled: !!session,
    select: (res) => res.data,
  });
}
