import type { OrderStatus } from "../types";

const statusConfig: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", className: "bg-green-50 text-green-700" },
  paid: { label: "Paid", className: "bg-blue-50 text-blue-700" },
  processing: { label: "Processing", className: "bg-purple-50 text-purple-700" },
  in_transit: { label: "In Transit", className: "bg-indigo-50 text-indigo-700" },
  delivered: { label: "Delivered", className: "bg-teal-50 text-teal-700" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
