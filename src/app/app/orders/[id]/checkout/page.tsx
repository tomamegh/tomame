"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeftIcon,
  PackageIcon,
  CreditCardIcon,
  CheckCircle2Icon,
  ShieldCheckIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOrder } from "@/features/orders/hooks/useOrders";
import { useInitializePayment } from "@/features/payments/hooks/usePayment";
import { toast } from "@/lib/sonner";

interface Props {
  params: Promise<{ id: string }>;
}

export default function CheckoutPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");

  const { data: order, isLoading } = useOrder(id);
  const { mutate: initializePayment, isPending } = useInitializePayment();

  const fmtGhs = (n: number) =>
    new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
    }).format(n);

  const handlePay = () => {
    initializePayment(
      { orderId: id },
      {
        onSuccess: (data) => {
          window.location.href = data.authorizationUrl;
        },
        onError: (err) => {
          toast.error({ title: "Payment failed", description: err.message });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-40">
        <Spinner scale={1.5} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/orders"
          className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to orders
        </Link>
        <p className="text-stone-500">Order not found.</p>
      </div>
    );
  }

  const alreadyPaid = order.status !== "pending";

  const p = order.pricing;

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link
          href={`/app/orders/${id}`}
          className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition-colors"
          aria-label="Back to order"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Checkout
          </p>
          <h1 className="text-xl font-bold text-stone-800">Complete Payment</h1>
        </div>
      </div>

      {alreadyPaid && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2Icon className="size-4 shrink-0" />
          This order has already been paid. No further action is needed.
        </div>
      )}

      {!alreadyPaid && paymentStatus === "failed" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Payment was not completed. Please try again.
        </div>
      )}

      <Card className="overflow-hidden p-0 gap-0">
        {/* Product summary */}
        <div className="px-5 py-4 border-b border-stone-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">
            Order Summary
          </p>
          <div className="flex items-center gap-3">
            {order.product_image_url ? (
              <div className="relative size-14 shrink-0 rounded-lg overflow-hidden border border-stone-200">
                <Image
                  src={order.product_image_url}
                  alt={order.product_name}
                  fill
                  className="object-contain"
                />
              </div>
            ) : (
              <div className="size-14 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                <PackageIcon className="size-6 text-stone-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-stone-400 uppercase tracking-wide">
                {order.origin_country} · Qty {order.quantity}
              </p>
              <p className="text-sm font-semibold text-stone-800 line-clamp-2">
                {order.product_name}
              </p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="px-5 py-4 border-b border-stone-100 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">
            Pricing Breakdown
          </p>
          {(p.pricing_method === "fixed_freight"
            ? [
                { label: "Item price (USD)", value: `$${p.subtotal_usd.toFixed(2)}` },
                {
                  label: "Int'l freight (incl. customs)",
                  value: `GH₵ ${(p.fixed_freight_ghs ?? 0).toFixed(2)}`,
                },
                { label: "Rate", value: `1 USD = ${p.exchange_rate} GHS`, muted: true },
              ]
            : [
                { label: "Subtotal", value: `$${p.subtotal_usd.toFixed(2)}` },
                {
                  label: "Seller shipping",
                  value: p.seller_shipping_usd
                    ? `$${p.seller_shipping_usd.toFixed(2)}`
                    : "FREE",
                },
                {
                  label: "Int'l freight (incl. customs)",
                  value: `$${(p.freight_usd ?? 0).toFixed(2)}`,
                },
                {
                  label: `Tax (${((p.service_fee_percentage ?? 0) * 100).toFixed(0)}%)`,
                  value: `$${(p.service_fee_usd ?? 0).toFixed(2)}`,
                },
                {
                  label: "Handling",
                  value: `$${(p.handling_fee_usd ?? 0).toFixed(2)}`,
                },
                { label: "Rate", value: `1 USD = ${p.exchange_rate} GHS`, muted: true },
              ]
          ).map(({ label, value, muted }) => (
            <div
              key={label}
              className={`flex justify-between text-sm gap-4 ${muted ? "text-stone-400" : "text-stone-600"}`}
            >
              <span>{label}</span>
              <span className="tabular-nums">{value}</span>
            </div>
          ))}
          <div className="flex justify-between items-baseline pt-2 border-t border-stone-200 mt-2">
            <span className="text-sm font-semibold text-stone-700">Total</span>
            <span className="text-2xl font-bold text-stone-900 tabular-nums">
              {fmtGhs(p.total_ghs)}
            </span>
          </div>
        </div>

        {/* Pay button */}
        <div className="px-5 py-4 space-y-3">
          {alreadyPaid ? (
            <Link href={`/app/orders/${id}`} className="block">
              <Button variant="outline" className="w-full gap-2" size="lg">
                View Order
              </Button>
            </Link>
          ) : (
            <>
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handlePay}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    Redirecting <Spinner />
                  </>
                ) : (
                  <>
                    <CreditCardIcon className="size-4" />
                    Pay {fmtGhs(p.total_ghs)}
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
                <ShieldCheckIcon className="size-3.5" />
                Secured by Paystack · Mobile Money &amp; Card accepted
              </div>
            </>
          )}
        </div>
      </Card>

      {paymentStatus === "success" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2Icon className="size-5 text-emerald-500 shrink-0" />
            <p className="text-sm text-stone-700">
              Payment confirmed! Your order is now being processed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
