import { ShoppingCartIcon, HandCoinsIcon, CircleOffIcon } from "lucide-react";
import type { Order } from "../types";
import AdminStatCard from "@/features/admin/components/stat-card";

interface OrderStats {
  total: number;
  totalRevenueGhs: number;
  needsReview: number;
  cancelled: number;
}

function computeStats(orders: Order[]): OrderStats {
  return {
    total: orders.length,
    totalRevenueGhs: orders
      .filter((o) => o.status !== "cancelled" && o.status !== "pending")
      .reduce((acc, o) => acc + (o.pricing?.total_ghs ?? 0), 0),
    needsReview: orders.filter((o) => o.needs_review).length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };
}

function fmt(n: number | undefined, decimals = 0) {
  if (n === undefined) return 0;
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

interface OrderStatCardsProps {
  orders: Order[] | undefined;
  isLoading?: boolean;
}

export function OrderStatCards({ orders, isLoading }: OrderStatCardsProps) {
  const stats = orders ? computeStats(orders) : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {/* Total Orders */}
      <AdminStatCard
        title="Total Orders"
        description="All time orders on the platform"
        value={fmt(stats?.total)}
        icon={ShoppingCartIcon}
        isLoading={!!isLoading}
        iconClassName="stroke-purple-500"
        iconContainerClassName="bg-purple-200/20 border-purple-200"
      />
      <AdminStatCard
        title="Total Revenue"
        description="Revenue from all orders"
        value={`GHS ${fmt(stats?.totalRevenueGhs, 2)}`}
        icon={HandCoinsIcon}
        isLoading={!!isLoading}
        iconClassName="stroke-sky-500"
        iconContainerClassName="bg-sky-200/20 border-sky-200"
      />
      <AdminStatCard
        title="Needs Reviews"
        description="All orders that needs a review"
        value={stats?.needsReview ?? 0}
        icon={HandCoinsIcon}
        isLoading={!!isLoading}
        iconClassName="stroke-amber-500"
        iconContainerClassName="bg-amber-200/20 border-amber-200"
      />
      <AdminStatCard
        title="Cancelled Orders"
        description="Total orders cancelled or rejected"
        value={stats?.cancelled ?? 0}
        icon={CircleOffIcon}
        isLoading={!!isLoading}
        iconClassName="stroke-rose-500"
        iconContainerClassName="bg-rose-200/20 border-rose-200"
      />
    </div>
  );
}
