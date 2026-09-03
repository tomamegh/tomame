"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusIcon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { OrdersList } from "./orders-list";
import { Card, CardContent } from "@/components/ui/card";
import { useOrders } from "../hooks";

interface Props {
  /** Outcome of a Paystack return that could not be tied back to one order. */
  paymentStatus?: string | null;
}

const PAYMENT_BANNERS: Record<
  string,
  { className: string; icon: typeof CheckCircle2Icon; message: string }
> = {
  success: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2Icon,
    message: "Payment received. Your order is being processed.",
  },
  failed: {
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertCircleIcon,
    message:
      "Payment was not completed. You have not been charged — open the order to try again.",
  },
  error: {
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: AlertCircleIcon,
    message:
      "We could not confirm your payment. If you were charged, it will be reflected here shortly — contact support if it is not.",
  },
};

export default function MyOrdersComponent({ paymentStatus }: Props) {
  const { data: orders = [], isPending, error, refetch } = useOrders();
  const banner = paymentStatus ? PAYMENT_BANNERS[paymentStatus] : undefined;

  return (
    <div className="space-y-10">
      {banner && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${banner.className}`}
        >
          <banner.icon className="size-4 shrink-0" />
          {banner.message}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-stone-800">My Orders</h1>
          <Button variant="primary" className="gap-2" asChild>
            <Link href="/app">
              <PlusIcon className="w-4 h-4" />
              <span>New</span>
            </Link>
          </Button>
        </div>
        <p className="text-stone-400 text-sm mt-1">
          Track your product requests and sourcing status
        </p>
      </div>

      <Card className="p-0 bg-transparent shadow-none border-none">
        <CardContent className="p-0 bg-transparent">
          <OrdersList
            orders={orders}
            isLoading={isPending}
            error={error}
            triggerFunction={refetch}
          />
        </CardContent>
      </Card>
    </div>
  );
}
