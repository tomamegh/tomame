import Link from "next/link";
import { PackageOpenIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderRow } from "./order-row";
import type { Order } from "@/features/orders/types";

interface RecentOrdersProps {
  orders: Order[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function RecentOrders({ orders, isLoading, error }: RecentOrdersProps) {
  const recent = (orders ?? []).slice(0, 3);

  return (
    <section aria-labelledby="recent-orders-heading" className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2
          id="recent-orders-heading"
          className="text-xl font-black tracking-tight text-stone-900"
        >
          Your Recent Orders
        </h2>
        <Link href="/app/orders">
          <button className="cursor-pointer rounded-xl border border-orange-500/20 px-4 py-2.5 text-xs font-bold text-[#ff5c35] transition-all hover:border-orange-500/40 hover:bg-orange-50/40 active:scale-[0.98]">
            View All Orders
          </button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading orders">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
          Failed to load orders. Please refresh the page.
        </div>
      ) : recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center">
          <PackageOpenIcon className="size-8 text-stone-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-stone-700">No orders yet</p>
          <p className="text-xs text-stone-500">
            Paste a product link above to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {recent.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      )}
    </section>
  );
}
