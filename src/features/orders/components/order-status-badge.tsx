import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "../types";

const statusConfig: Record<OrderStatus, { label: string; className: string }> =
  {
    pending: {
      label: "Pending",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    paid: {
      label: "Paid",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    processing: {
      label: "Processing",
      className: "bg-purple-50 text-purple-700 border-purple-200",
    },
    in_transit: {
      label: "In Transit",
      className: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    delivered: {
      label: "Delivered",
      className: "bg-teal-50 text-teal-700 border-teal-200",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-red-50 text-red-700 border-red-200",
    },
  };

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
