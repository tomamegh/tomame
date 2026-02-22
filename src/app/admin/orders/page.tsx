import { AdminOrdersList } from "@/features/orders/components";

export default function AdminOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Orders</h1>
        <p className="text-stone-400 text-sm mt-1">
          Manage all customer product requests
        </p>
      </div>
      <AdminOrdersList />
    </div>
  );
}
