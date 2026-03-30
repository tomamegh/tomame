import {
  CreditCardIcon,
  TrendingUpIcon,
  HandCoinsIcon,
  CircleOffIcon,
} from "lucide-react";
import type { TransactionStats } from "../types";
import AdminStatCard from "@/features/admin/components/stat-card";

interface TransactionStatCardsProps {
  stats: TransactionStats | undefined;
  isLoading?: boolean;
}

function fmt(n: number | undefined, decimals = 0) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function TransactionStatCards({
  stats,
  isLoading,
}: TransactionStatCardsProps) {
  const successRate =
    stats && stats.total > 0
      ? Math.round((stats.successful / stats.total) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <AdminStatCard
        title="Total Transactions"
        description="Transaction recorded on the platform"
        value={fmt(stats?.total)}
        isLoading={!!isLoading}
        icon={CreditCardIcon}
        iconContainerClassName="bg-blue-200/20 border-blue-200"
        iconClassName="stroke-blue-500"
      />

      <AdminStatCard
        title="Total Revenue"
        description="Revenue from successful payments"
        value={`GHS ${fmt(stats?.totalRevenueGhs, 2)}`}
        isLoading={!!isLoading}
        icon={HandCoinsIcon}
        iconContainerClassName="bg-green-200/20 border-green-200"
        iconClassName="stroke-green-500"
      />

      <AdminStatCard
        title="Success Rate"
        description="Rate of successful payments"
        value={`${successRate}%`}
        isLoading={!!isLoading}
        icon={TrendingUpIcon}
        iconContainerClassName="bg-cyan-200/20 border-cyan-200"
        iconClassName="stroke-cyan-500"
      />

      <AdminStatCard
        title="Failed Transactions"
        description="No. of all failed transactions"
        value={fmt(stats?.failed)}
        isLoading={!!isLoading}
        icon={CircleOffIcon}
        iconContainerClassName="bg-red-200/20 border-red-200"
        iconClassName="stroke-red-500"
      />
    </div>
  );
}
