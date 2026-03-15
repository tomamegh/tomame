"use client";

import { OrderStatCards } from "@/features/orders/components/order-stat-cards";
import { useAdminOrdersData } from "@/features/orders/hooks/useAdminOrdersData";

export function OrdersPageClient() {
  const { data, isLoading } = useAdminOrdersData();
  return <OrderStatCards orders={data?.orders} isLoading={isLoading} />;
}
