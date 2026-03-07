"use client";

import { DeliveryStatCards } from "@/features/deliveries/components/stat-cards";
import { useAdminDeliveries } from "@/features/deliveries/hooks/useDeliveries";

export function DeliveriesPageClient() {
  const { data, isLoading } = useAdminDeliveries();
  return <DeliveryStatCards stats={data?.stats} isLoading={isLoading} />;
}
