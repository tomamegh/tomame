"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { DeliveryResponse } from "../deliveries.service";

export const deliveryKeys = {
  all: ["deliveries"] as const,
  admin: () => [...deliveryKeys.all, "admin"] as const,
};

export function useAdminDeliveries() {
  return useQuery<ApiSuccessResponse<DeliveryResponse>, Error, DeliveryResponse>({
    queryKey: deliveryKeys.admin(),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<DeliveryResponse>>("/api/admin/deliveries"),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}
