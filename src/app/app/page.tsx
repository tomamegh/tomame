"use client";
import { useOrders } from "@/features/orders/hooks";
import { HeroSection } from "@/features/orders/components/hero-section";
import { StatsRow } from "@/features/orders/components/stats-row";
import { OrdersList } from "@/features/orders/components";
import Link from "next/link";

export default function DashboardPage() {
  const { data: orders = [], isPending, error } = useOrders();

  return (
    <div className="space-y-10 pb-10">
      <HeroSection />
      <StatsRow orders={orders} isLoading={isPending} />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-tight text-stone-800">
            Recent Orders
          </h2>
          <Link
            href="/app/orders"
            className="text-sm font-medium text-orange-500 hover:text-orange-600"
          >
            View all
          </Link>
        </div>
        <OrdersList orders={orders} isLoading={isPending} error={error} />
      </div>
    </div>
  );
}
