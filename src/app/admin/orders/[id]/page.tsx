import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { AdminOrderDetail } from "@/features/orders/components/admin-order-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/orders"
          className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
          aria-label="Back to orders"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Orders
          </p>
          <h1 className="text-xl font-bold text-stone-800">Order Details</h1>
        </div>
      </div>

      <AdminOrderDetail orderId={id} />
    </div>
  );
}
