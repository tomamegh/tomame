"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import { useSession } from "@/features/auth/providers/auth-provider";
import type { AuditLog } from "@/features/audit/types";
import type { ApiSuccessResponse } from "@/types/api";

export const ACTIVITY_QUERY_KEY = ["me", "activity"] as const;

export function useActivity() {
  const { session } = useSession();

  return useQuery({
    queryKey: [...ACTIVITY_QUERY_KEY],
    queryFn: () =>
      apiFetch<ApiSuccessResponse<AuditLog[]>>("/api/app/me/activity"),
    enabled: !!session,
    select: (res) => res.data,
  });
}
