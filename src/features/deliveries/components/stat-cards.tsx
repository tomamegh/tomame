import {
  PackageIcon,
  TruckIcon,
  // CheckCircle2Icon,
  ClockIcon,
  HandshakeIcon,
} from "lucide-react";
import type { DeliveryStats } from "../types";
import AdminStatCard from "@/features/admin/components/stat-card";

interface DeliveryStatCardsProps {
  stats: DeliveryStats | undefined;
  isLoading?: boolean;
}

function fmt(n: number | undefined) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("en-GH").format(n);
}

export function DeliveryStatCards({
  stats,
  isLoading,
}: DeliveryStatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Shipments */}
      <AdminStatCard
        title="Total Shipments"
        description="All time order shipments"
        value={fmt(stats?.total)}
        isLoading={!!isLoading}
        icon={PackageIcon}
        iconClassName="stroke-purple-600"
        iconContainerClassName="bg-purple-200/20 border-purple-200"
      />

      <AdminStatCard
        title="Pending Dispatch"
        description="Orders ready to be shipped"
        value={fmt(stats?.pendingDispatch)}
        isLoading={!!isLoading}
        icon={ClockIcon}
        iconClassName="stroke-amber-500"
        iconContainerClassName="bg-amber-200/20 border-amber-200"
      />

      <AdminStatCard
        title="In Transit"
        description="Orders on their way to customer"
        value={fmt(stats?.inTransit)}
        isLoading={!!isLoading}
        icon={TruckIcon}
        iconClassName="stroke-blue-500"
        iconContainerClassName="bg-blue-200/20 border-blue-200"
      />

      <AdminStatCard
        title="Delivered"
        description="Delivered & completed orders"
        value={fmt(stats?.inTransit)}
        isLoading={!!isLoading}
        icon={HandshakeIcon}
        iconClassName="stroke-emerald-500"
        iconContainerClassName="bg-emerald-200/20 border-emerald-200"
      />
    </div>
  );
}
