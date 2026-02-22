"use client";

import { useUserOrders } from "../hooks/useOrders";
import { OrderCard } from "./order-card";
import { EmptyOrders } from "./empty-orders";
import { Skeleton } from "@/components/ui/skeleton";

export function OrdersList() {
  const { data, isPending, error } = useUserOrders();

  if (isPending) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
        {error.message}
      </div>
    );
  }

  if (!data?.orders.length) {
    return <EmptyOrders />;
  }

  return (
    <div className="space-y-4">
      {data.orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}
