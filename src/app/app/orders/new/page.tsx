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
} from "lucide-react";
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
  productName: string;
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

function OrderSuccess({
  order,
  onReset,
}: {
  order: CreatedOrder;
  onReset: () => void;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/50 fade-in">
      <CardContent className="flex flex-col items-center justify-center text-center space-y-4 py-10">
        <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2Icon className="size-8 text-emerald-600" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-emerald-900">
            Order Successfully Placed!
          </h3>
          <p className="text-emerald-700/80 max-w-sm mx-auto text-sm">
            We&apos;ve received your request for{" "}
            <span className="font-semibold">{order.productName}</span>. Our team
            will review it shortly.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-4">
          <Button variant="outline" onClick={onReset} className="gap-1.5">
            <ScanSearchIcon className="size-3.5" />
            Extract Another
          </Button>
          <Button variant="primary" asChild>
            <Link href={`/app/orders/${order.id}`}>
              View Order
              <ArrowRightIcon className="size-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
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

  const { mutate: extractProduct } = useExtractProduct();
  const { mutate: createOrder, isPending: isOrdering } = useCreateOrder();

  useEffect(()=>{
    if(orderError) {
      toast.error({title: 'Failed to create order',description: orderError})
      // toast.error('Failed',{description: orderError})
    }
  }, [orderError])

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

  const handleOrderSubmit = (data: CreateOrderSchemaType) => {
    setOrderError(null);
    createOrder(data, {
      onSuccess: (result) => {
        setCreatedOrder({ id: result.id, productName: result.productName });
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
