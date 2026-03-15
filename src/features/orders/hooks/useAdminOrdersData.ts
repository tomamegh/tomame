"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { OrderList } from "../types";
import { orderKeys } from "./useOrders";

export function useAdminOrdersData() {
  return useQuery<ApiSuccessResponse<OrderList>, Error, OrderList>({
    queryKey: orderKeys.admin(),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<OrderList>>("/api/admin/orders"),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}
