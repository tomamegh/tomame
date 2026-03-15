import { AdminOrdersTable } from "@/features/orders/components/admin-orders-table";
import { OrdersPageClient } from "./orders-page-client";

export default function AdminOrdersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Orders</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Manage and track all customer orders
        </p>
      </div>
      <OrdersPageClient />
      <AdminOrdersTable />
    </div>
  );
}
