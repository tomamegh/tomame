"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import type { DashboardData } from "../types";

export const dashboardKeys = {
  all: ["admin", "dashboard"] as const,
};

export function useAdminDashboard() {
  return useQuery<ApiSuccessResponse<DashboardData>, Error, DashboardData>({
    queryKey: dashboardKeys.all,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<DashboardData>>("/api/admin/dashboard"),
    select: (res) => res.data,
    staleTime: 60_000,
  });
}
