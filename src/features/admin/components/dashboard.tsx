"use client";

import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { StatCards } from "./stat-cards";
import { OverviewChart } from "./chart";
import { LatestOrdersTable } from "./latest-orders-table";
import { LatestDeliveriesTable } from "./latest-deliveries-table";
import { LatestTransactionsTable } from "./latest-transactions-table";

export function AdminDashboard() {
  const { data, isLoading } = useAdminDashboard();

  return (
    <div className="space-y-8 py-2">
      <StatCards stats={data?.stats} isLoading={isLoading} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <OverviewChart />
        <LatestOrdersTable orders={data?.latestOrders} isLoading={isLoading} />
        <LatestDeliveriesTable
          deliveries={data?.latestDeliveries}
          isLoading={isLoading}
        />
        <LatestTransactionsTable
          transactions={data?.latestTransactions}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
