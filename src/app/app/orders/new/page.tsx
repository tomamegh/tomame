"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  AlertCircleIcon,
  ScanSearchIcon,
  PackageIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  TruckIcon,
} from "lucide-react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ProductPreview } from "@/features/extraction/components/product-preview";
import { OrderForm } from "@/features/extraction/components/order-form";
import { useExtractProduct } from "@/features/extraction/hooks/useExtraction";
import { useCreateOrder } from "@/features/orders/hooks/useCreateOrder";
import type { ExtractionResult } from "@/features/extraction/types";
import type { CreateOrderSchemaType } from "@/features/orders/schema";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "@/lib/sonner";

type Step = "extracting" | "error" | "preview" | "ordering" | "success";

interface CreatedOrder {
  id: string;
  product_name: string;
  product_image_url: string | null;
  origin_country: "USA" | "UK" | "CHINA";
  quantity: number;
  needs_review: boolean;
  pricing: {
    subtotal_usd: number;
    shipping_fee_usd: number;
    service_fee_usd: number;
    total_usd: number;
    exchange_rate: number;
    total_ghs: number;
    service_fee_percentage: number;
  };
}

function ExtractionSkeleton() {
  return (
    <div className="space-y-4 fade-in">
      <Card className="p-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner scale={2} />
            </EmptyMedia>
            <EmptyTitle>Analyzing Product Link</EmptyTitle>
            <EmptyDescription>
              We are currently analyzing the product link you provided. This may
              take a moment. Please wait while we extract the necessary details
              to process your order.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>

      {/* Skeleton card */}
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-5 md:gap-8">
          {/* Image placeholder */}
          <Skeleton className="shrink-0 size-28 sm:size-36 rounded-xl" />

          {/* Details placeholder */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        </CardContent>

        <div className="flex items-center justify-between px-6 py-4 border-t">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </Card>
    </div>
  );
}

// ── Error state ─────────────────────────────────────────────────────────────

function ExtractionError({
  message,
  url,
  onRetry,
}: {
  message: string | null;
  url: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4 fade-in">
      <Card>
        <CardContent className="flex flex-col items-center text-center space-y-4 py-10">
          <div className="size-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircleIcon className="size-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-stone-800">
              Extraction failed
            </h3>
            <p className="text-sm text-stone-500 max-w-sm">
              {message ?? "We couldn't read this product page."}
            </p>
            {url && (
              <p className="text-xs text-stone-400 mt-1 break-all max-w-xs mx-auto">
                {url}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={onRetry} className="gap-1.5">
              <ArrowLeftIcon className="size-3.5" />
              Try another URL
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Success state ───────────────────────────────────────────────────────────

const NEXT_STEPS = [
  {
    icon: ClipboardCheckIcon,
    title: "Admin review",
    desc: "Our team verifies your order details and confirms availability.",
  },
  {
    icon: CreditCardIcon,
    title: "Payment",
    desc: "You'll receive a payment link via email. Full payment is required before processing.",
  },
  {
    icon: TruckIcon,
    title: "Purchase & delivery",
    desc: "We buy the item and ship it to you with tracking updates along the way.",
  },
];

function OrderSuccess({
  order,
  onReset,
}: {
  order: CreatedOrder;
  onReset: () => void;
}) {
  const p = order.pricing;
  const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
  const fmtGhs = (n: number) =>
    new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
    }).format(n);

  return (
    <div className="space-y-4 fade-in">
      <Card className="overflow-hidden p-0 gap-0">
        {/* Green accent bar — flush at top */}
        <div className="h-1.5 bg-linear-to-r from-emerald-400 to-green-500" />

        {/* Hero */}
        <div className="px-6 pt-8 pb-6 text-center space-y-3 border-b border-stone-100">
          <div className="mx-auto size-16 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center">
            <CheckCircle2Icon className="size-8 text-emerald-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-stone-900">Order Placed!</h2>
            <p className="text-sm text-stone-500">
              We&apos;ve received your request and our team will review it
              shortly.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-hidden w-full">
          {/* Product row */}
          <div className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50 p-3 overflow-hidden">
            {order.product_image_url ? (
              <Image
                src={order.product_image_url}
                alt={order.product_name}
                width={56}
                height={56}
                className="size-14 rounded-lg object-cover shrink-0 border border-stone-200"
              />
            ) : (
              <div className="size-14 rounded-lg bg-stone-200 flex items-center justify-center shrink-0">
                <PackageIcon className="size-6 text-stone-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">
                {order.origin_country} · Qty {order.quantity}
              </p>
              <p className="text-sm font-semibold text-stone-800 line-clamp-2 break-all">
                {order.product_name}
              </p>
              {order.needs_review && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Pending admin review
                </p>
              )}
            </div>
          </div>

          {/* Pricing summary */}
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Pricing Summary
              </p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {[
                { label: "Subtotal", value: fmtUsd(p.subtotal_usd) },
                { label: "Shipping fee", value: fmtUsd(p.shipping_fee_usd) },
                {
                  label: `Service fee (${(p.service_fee_percentage * 100).toFixed(0)}%)`,
                  value: fmtUsd(p.service_fee_usd),
                },
                {
                  label: "Total (USD)",
                  value: fmtUsd(p.total_usd),
                  muted: true,
                },
                {
                  label: "Rate",
                  value: `1 USD = ${p.exchange_rate} GHS`,
                  muted: true,
                },
              ].map(({ label, value, muted }) => (
                <div
                  key={label}
                  className={`flex justify-between text-sm gap-4 ${muted ? "text-stone-400" : "text-stone-600"}`}
                >
                  <span>{label}</span>
                  <span className="tabular-nums">{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-baseline pt-2 border-t border-stone-200">
                <span className="text-sm font-semibold text-stone-700">
                  Total (GHS)
                </span>
                <span className="text-xl font-bold text-stone-900 tabular-nums">
                  {fmtGhs(p.total_ghs)}
                </span>
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">
              What happens next
            </p>
            <ol className="space-y-3">
              {NEXT_STEPS.map(({ icon: Icon, title, desc }, i) => (
                <li key={title} className="flex gap-3">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="size-7 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500">
                      {i + 1}
                    </div>
                    {i < NEXT_STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-stone-200 min-h-3" />
                    )}
                  </div>
                  <div className="pb-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className="size-3.5 text-stone-400 shrink-0" />
                      <p className="text-sm font-semibold text-stone-700">
                        {title}
                      </p>
                    </div>
                    <p className="text-xs text-stone-500">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-stone-100 flex items-center gap-3 justify-center">
          <Button variant="outline" onClick={onReset} className="gap-1.5">
            <ScanSearchIcon className="size-3.5" />
            Order Another
          </Button>
          <Button variant="primary" asChild>
            <Link href={`/app/orders/${order.id}`}>
              View Order
              <ArrowRightIcon className="size-4 ml-1" />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PageHeader({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    extracting: "Extracting Product",
    error: "Extraction Failed",
    preview: "Product Preview",
    ordering: "Review & Submit",
    success: "Order Placed",
  };

  return (
    <div className="flex items-center gap-3 mb-6">
      <Link
        href="/app"
        className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition-colors"
        aria-label="Back to dashboard"
      >
        <ArrowLeftIcon className="size-4" />
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          New Order
        </p>
        <h1 className="text-xl font-bold text-stone-800">{labels[step]}</h1>
      </div>
    </div>
  );
}

// ── Main content (inside Suspense) ──────────────────────────────────────────

function NewOrderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = decodeURIComponent(searchParams.get("url") ?? "");

  const [step, setStep] = useState<Step>("extracting");
  const [extractionResult, setExtractionResult] =
    useState<ExtractionResult | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const { mutateAsync: extractProduct } = useExtractProduct();
  const { mutateAsync: createOrder, isPending: isOrdering } = useCreateOrder();

  useEffect(() => {
    if (orderError) {
      toast.error({ title: "Failed to create order", description: orderError });
      // toast.error('Failed',{description: orderError})
    }
  }, [orderError]);

  useEffect(() => {
    if (!url) {
      router.replace("/app");
      return;
    }

    extractProduct(
      { productUrl: url },
      {
        onSuccess: (data) => {
          setExtractionResult(data);
          setStep("preview");
        },
        onError: (err) => {
          setExtractionError(err.message);
          setStep("error");
        },
      },
    );
  }, []);

  const handleOrderSubmit = async (data: CreateOrderSchemaType) => {
    setOrderError(null);
    createOrder(data, {
      onSuccess: (result) => {
        setCreatedOrder({
          id: result.id,
          product_name: result.product_name,
          product_image_url: result.product_image_url,
          origin_country: result.origin_country,
          quantity: result.quantity,
          needs_review: result.needs_review,
          pricing: result.pricing,
        });
        setStep("success");
      },
      onError: (err) => setOrderError(err.message),
    });
  };

  return (
    <div>
      <PageHeader step={step} />

      {step === "extracting" && <ExtractionSkeleton />}

      {step === "error" && (
        <ExtractionError
          message={extractionError}
          url={url}
          onRetry={() => router.push("/app")}
        />
      )}

      {step === "preview" && extractionResult && (
        <ProductPreview
          data={extractionResult}
          productUrl={url}
          onOrder={() => setStep("ordering")}
          onReset={() => router.push("/app")}
        />
      )}

      {step === "ordering" && extractionResult && (
        <div className="space-y-4 fade-in">
          <OrderForm
            extractionData={extractionResult}
            productUrl={url}
            isLoading={isOrdering}
            onSubmit={handleOrderSubmit}
            onBack={() => setStep("preview")}
          />
        </div>
      )}

      {step === "success" && createdOrder && (
        <OrderSuccess
          order={createdOrder}
          onReset={() => router.push("/app")}
        />
      )}
    </div>
  );
}

// ── Page export ─────────────────────────────────────────────────────────────

export default function NewOrderPage() {
  return (
    <main className="">
      <Suspense
        fallback={
          <div className="">
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-lg p-1.5 text-stone-400">
                <ArrowLeftIcon className="size-4" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-6 w-40 rounded" />
              </div>
            </div>
            <ExtractionSkeleton />
          </div>
        }
      >
        <NewOrderContent />
      </Suspense>
    </main>
  );
}
