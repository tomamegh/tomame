"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeftIcon,
  PackageIcon,
  SmartphoneIcon,
  CheckCircle2Icon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { useOrder, orderKeys } from "@/features/orders/hooks/useOrders";
import {
  useInitializePayment,
  usePaymentStatus,
} from "@/features/payments/hooks/usePayment";
import {
  HUBTEL_CHANNELS,
  HUBTEL_CHANNEL_LABELS,
  type HubtelChannel,
} from "@/lib/hubtel/client";
import { toast } from "@/lib/sonner";

interface Props {
  params: Promise<{ id: string }>;
}

const NETWORKS: { value: HubtelChannel; label: string; short: string }[] = [
  { value: HUBTEL_CHANNELS.MTN, label: HUBTEL_CHANNEL_LABELS["mtn-gh"], short: "MTN" },
  { value: HUBTEL_CHANNELS.TELECEL, label: HUBTEL_CHANNEL_LABELS["vodafone-gh"], short: "Telecel" },
  { value: HUBTEL_CHANNELS.AIRTELTIGO, label: HUBTEL_CHANNEL_LABELS["tigo-gh"], short: "AirtelTigo" },
];

export default function CheckoutPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");

  const [msisdn, setMsisdn] = useState("");
  const [channel, setChannel] = useState<HubtelChannel>(HUBTEL_CHANNELS.MTN);
  const [reference, setReference] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: order, isLoading } = useOrder(id);
  const { mutate: initializePayment, isPending } = useInitializePayment();
  const { data: statusData } = usePaymentStatus(reference);

  const livePaymentStatus = statusData?.payment.status;
  const awaitingApproval = reference !== null && livePaymentStatus !== "failed"
    && livePaymentStatus !== "success";

  // Mirrors the server-side schema so the button disables before a round-trip.
  const isMsisdnValid = /^(?:\+?233|0)\d{9}$/.test(msisdn.trim());

  const fmtGhs = (n: number) =>
    new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
    }).format(n);

  // The prompt resolves out-of-band on the customer's handset, so react to the
  // polled status rather than to the mutation result.
  useEffect(() => {
    if (livePaymentStatus === "success") {
      // The order moved pending → paid server-side; refresh what we show.
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      toast.success({
        title: "Payment received",
        description: "Your order is now being processed.",
      });
    } else if (livePaymentStatus === "failed") {
      toast.error({
        title: "Payment not completed",
        description: "The prompt was declined or expired. You can try again.",
      });
      setReference(null);
    }
  }, [livePaymentStatus]);

  const handlePay = () => {
    initializePayment(
      { orderId: id, msisdn: msisdn.trim(), channel },
      {
        onSuccess: (data) => {
          setReference(data.payment.reference);
          toast.success({ title: "Check your phone", description: data.message });
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
  const hasAdminPrice = order.admin_total_ghs != null;
  const pricingPendingReview = p.pricing_method === "needs_review" && !hasAdminPrice;
  const effectiveTotalGhs = hasAdminPrice ? order.admin_total_ghs! : p.total_ghs;

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

      {!alreadyPaid &&
        (paymentStatus === "failed" || livePaymentStatus === "failed") && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <XCircleIcon className="size-4 shrink-0" />
            Payment was not completed. The prompt may have been declined or
            timed out — please try again.
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
          {pricingPendingReview ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
              Pricing is pending admin review. You&apos;ll be notified once confirmed.
            </div>
          ) : hasAdminPrice ? (
            <>
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700 mb-2">
                Price confirmed by our team.
                {order.admin_pricing_note && (
                  <span className="block text-xs text-blue-600 mt-1">{order.admin_pricing_note}</span>
                )}
              </div>
              <div className="flex justify-between items-baseline pt-2">
                <span className="text-sm font-semibold text-stone-700">Total</span>
                <span className="text-2xl font-bold text-stone-900 tabular-nums">
                  {fmtGhs(effectiveTotalGhs)}
                </span>
              </div>
            </>
          ) : (
            <>
              {[
                { label: "Item price (USD)", value: `$${p.subtotal_usd.toFixed(2)}` },
                { label: `Tax (${(p.tax_percentage * 100).toFixed(0)}%)`, value: `$${p.tax_usd.toFixed(2)}` },
                { label: `Value fee (${(p.value_fee_percentage * 100).toFixed(0)}%)`, value: `$${p.value_fee_usd.toFixed(2)}` },
                { label: "Freight", value: `GH₵ ${p.flat_rate_ghs.toFixed(2)}` },
                { label: "Rate", value: `1 USD = ${p.exchange_rate} GHS`, muted: true },
              ].map(({ label, value, muted }) => (
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
                  {fmtGhs(effectiveTotalGhs)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Mobile money payment */}
        <div className="px-5 py-4 space-y-4">
          {alreadyPaid || livePaymentStatus === "success" ? (
            <Link href={`/app/orders/${id}`} className="block">
              <Button variant="outline" className="w-full gap-2" size="lg">
                View Order
              </Button>
            </Link>
          ) : awaitingApproval ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-amber-700">
                  <Spinner />
                  <span className="text-sm font-semibold">
                    Waiting for approval
                  </span>
                </div>
                <p className="text-sm text-amber-700">
                  A payment prompt for{" "}
                  <span className="font-semibold">{fmtGhs(effectiveTotalGhs)}</span>{" "}
                  was sent to <span className="font-semibold">{msisdn}</span>.
                  Enter your mobile money PIN to approve it.
                </p>
                <p className="text-xs text-amber-600">
                  No prompt? Dial your network&apos;s approvals menu
                  (MTN: *170# → 6 → 3) to find pending requests.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setReference(null)}
              >
                Cancel and start over
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Mobile Money Network
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {NETWORKS.map((n) => (
                    <button
                      key={n.value}
                      type="button"
                      onClick={() => setChannel(n.value)}
                      aria-pressed={channel === n.value}
                      className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors ${
                        channel === n.value
                          ? "border-stone-800 bg-stone-800 text-white"
                          : "border-stone-200 text-stone-600 hover:border-stone-400"
                      }`}
                    >
                      {n.short}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="msisdn"
                  className="text-xs font-semibold uppercase tracking-wide text-stone-400"
                >
                  Mobile Money Number
                </Label>
                <Input
                  id="msisdn"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0244000000"
                  value={msisdn}
                  onChange={(e) => setMsisdn(e.target.value)}
                />
                <p className="text-xs text-stone-400">
                  We&apos;ll send a payment prompt to this{" "}
                  {NETWORKS.find((n) => n.value === channel)?.label} wallet.
                </p>
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handlePay}
                disabled={isPending || pricingPendingReview || !isMsisdnValid}
              >
                {isPending ? (
                  <>
                    Sending prompt <Spinner />
                  </>
                ) : (
                  <>
                    <SmartphoneIcon className="size-4" />
                    Pay {fmtGhs(effectiveTotalGhs)}
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
                <ShieldCheckIcon className="size-3.5" />
                Secured by Hubtel · MTN, Telecel &amp; AirtelTigo
              </div>
            </>
          )}
        </div>
      </Card>

      {(paymentStatus === "success" || livePaymentStatus === "success") && (
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
