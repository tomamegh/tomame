"use client";

import { useRouter } from "next/navigation";
import { useOrders } from "@/features/orders/hooks";
import { HeroSection } from "./_components/hero-section";
import { StatsRow } from "./_components/stats-row";
import { OrdersList } from "@/features/orders/components";

export default function DashboardPage() {
  const router = useRouter();
  const { data: orders=[], isPending, error } = useOrders();

  return (
    <div className="space-y-16 pb-16">
      <HeroSection
        onSubmit={(url) =>
          router.push(`/app/orders/new?url=${encodeURIComponent(url)}`)
        }
      />
      <StatsRow orders={orders} isLoading={isPending} />
      {/* <RecentOrders orders={orders} isLoading={isPending} error={error} /> */}
      <OrdersList orders={orders} isLoading={isPending} error={error} />
    </div>
  );
}
