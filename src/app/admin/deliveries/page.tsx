import { AdminDeliveriesTable } from "@/features/deliveries/components/deliveries-table";
import { DeliveriesPageClient } from "./deliveries-page-client";

export default function AdminDeliveriesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Deliveries</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Track and manage orders in the delivery pipeline
        </p>
      </div>
      <DeliveriesPageClient />
      <AdminDeliveriesTable />
    </div>
  );
}
