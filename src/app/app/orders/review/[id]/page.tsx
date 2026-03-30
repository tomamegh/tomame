"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  ScanSearchIcon,
  PackageIcon,
  PackageCheckIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  TruckIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  MinusIcon,
  PlusIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  ShoppingCartIcon,
} from "lucide-react";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useCreateOrder } from "@/features/orders/hooks/useCreateOrder";
import type { ExtractionResult } from "@/features/extraction/types";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import { toast } from "@/lib/sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExtractionCacheResponse extends ExtractionResult {
  extraction_cache_id: string;
  product_url: string;
}

interface CreatedOrder {
  id: string;
  product_name: string;
  product_image_url: string | null;
  origin_country: "USA" | "UK" | "CHINA";
  quantity: number;
  needs_review: boolean;
  pricing: OrderPricingBreakdown;
}

// ── Success state ────────────────────────────────────────────────────────────

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
  const fmtGhs = (n: number) =>
    new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
    }).format(n);
  const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="space-y-4 fade-in">
      <Card className="overflow-hidden p-0 gap-0">
        <div className="h-1.5 bg-linear-to-r from-emerald-400 to-green-500" />
        <div className="px-6 pt-8 pb-6 text-center space-y-3 border-b border-stone-100">
          <div className="mx-auto size-16 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center">
            <CheckCircle2Icon className="size-8 text-emerald-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-stone-900">Order Placed!</h2>
            <p className="text-sm text-stone-500">
              We&apos;ve received your request and our team will review it shortly.
            </p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-5 overflow-hidden w-full">
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
                <p className="text-xs text-amber-600 mt-0.5">Pending admin review</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-50 px-4 py-2.5 border-b border-stone-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Pricing Summary
              </p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {p.pricing_method === "needs_review" ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                  Pricing is pending admin review.
                </div>
              ) : null}
              {p.pricing_method !== "needs_review" &&
                [
                  { label: "Item price (USD)", value: fmtUsd(p.subtotal_usd) },
                  { label: `Tax (${(p.tax_percentage * 100).toFixed(0)}%)`, value: fmtUsd(p.tax_usd) },
                  { label: `Value fee (${(p.value_fee_percentage * 100).toFixed(0)}%)`, value: fmtUsd(p.value_fee_usd) },
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
              <div className="flex justify-between items-baseline pt-2 border-t border-stone-200">
                <span className="text-sm font-semibold text-stone-700">Total (GHS)</span>
                <span className="text-xl font-bold text-stone-900 tabular-nums">
                  {fmtGhs(p.total_ghs)}
                </span>
              </div>
            </div>
          </div>

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
                      <p className="text-sm font-semibold text-stone-700">{title}</p>
                    </div>
                    <p className="text-xs text-stone-500">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Card>
      <div className="py-5 border-t border-stone-100 flex items-center justify-end gap-3">
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
    </div>
  );
}

// ── Review form (product info + quantity/instructions) ────────────────────────

function ReviewForm({
  extraction,
  isLoading,
  onSubmit,
}: {
  extraction: ExtractionCacheResponse;
  isLoading: boolean;
  onSubmit: (data: {
    quantity: number;
    specialInstructions: string;
    pricing: OrderPricingBreakdown | null;
  }) => void;
}) {
  const { product, country, platform, extraction_success } = extraction;
  const name = product.title;
  const price = product.price;
  const currency = product.currency;
  const image = product.image;
  const brand = product.specifications?.Brand || product.brand;
  const category = product.category;
  const weight = product.weight;
  const dimensions = product.dimensions;

  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [pricing, setPricing] = useState<OrderPricingBreakdown | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unsupportedRegion = !country;
  const needsReview = !extraction_success || !name || price === null;

  // Fetch pricing preview
  useEffect(() => {
    if (unsupportedRegion || !price || price <= 0) {
      setPricing(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPricingLoading(true);
      try {
        const params = new URLSearchParams({
          itemPriceUsd: String(price),
          quantity: String(quantity),
        });
        if (category) params.set("category", category);
        const res = await fetch(`/api/pricing/preview?${params}`);
        if (res.ok) {
          const json = await res.json();
          setPricing(json.data as OrderPricingBreakdown);
        } else {
          setPricing(null);
        }
      } catch {
        setPricing(null);
      } finally {
        setPricingLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [price, quantity, category]);

  return (
    <div className="space-y-4 fade-in">
      {/* Unsupported region notice */}
      {unsupportedRegion && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div>
            <p className="font-semibold">Region not supported</p>
            <p className="text-red-700/80 text-xs mt-0.5">
              This product is from an Amazon region we don&apos;t currently support.
              Only Amazon US (amazon.com) orders are available at this time.
            </p>
          </div>
        </div>
      )}

      {/* Needs review notice */}
      {!unsupportedRegion && needsReview && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Admin review required</p>
            <p className="text-amber-700/80 text-xs mt-0.5">
              Some product details couldn&apos;t be extracted. Our team will review
              and confirm before processing.
            </p>
          </div>
        </div>
      )}

      {/* Product info card (read-only) */}
      <Card className="overflow-hidden">
        <CardContent className="flex start max-md:flex-col gap-5 md:gap-8">
          {/* Image */}
          <div className="shrink-0">
            {image ? (
              <div className="relative size-28 sm:size-36 lg:size-40 rounded-xl overflow-hidden border border-stone-200/60 bg-stone-50 flex items-center justify-center">
                <Image
                  src={image}
                  alt={name ?? "Product image"}
                  width={120}
                  height={120}
                  className="w-full h-full object-contain p-2"
                />
              </div>
            ) : (
              <div className="size-28 sm:size-36 lg:size-40 rounded-xl border border-stone-200/60 bg-stone-50 flex items-center justify-center">
                <ShoppingCartIcon className="size-10 text-stone-300" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Product
              </p>
              <p className="font-semibold text-stone-800 leading-snug text-sm">
                {name ?? (
                  <span className="text-stone-400 italic">Not detected</span>
                )}
              </p>
            </div>

            <div className="space-y-1.5 w-full md:w-fit">
              {price !== null && (
                <div className="flex items-center gap-5 justify-between">
                  <span className="text-sm font-semibold text-stone-700">Price</span>
                  <span className="text-stone-800">
                    <span className="text-xs font-medium text-stone-500 mr-0.5">
                      {currency ?? "USD"}
                    </span>
                    <span className="text-base font-bold">{price.toFixed(2)}</span>
                  </span>
                </div>
              )}
              {brand && (
                <div className="flex items-center gap-5 justify-between">
                  <span className="text-sm font-semibold text-stone-700">Brand</span>
                  <span className="text-sm font-semibold text-stone-800">{brand}</span>
                </div>
              )}
              {category && (
                <div className="flex items-center gap-5 justify-between">
                  <span className="text-sm font-semibold text-stone-700">Category</span>
                  <span className="text-sm font-semibold text-stone-800">{category}</span>
                </div>
              )}
              {weight && (
                <div className="flex items-center gap-5 justify-between">
                  <span className="text-sm font-semibold text-stone-700">Weight</span>
                  <span className="text-sm font-semibold text-stone-800">{weight}</span>
                </div>
              )}
              {dimensions && (
                <div className="flex items-center gap-5 justify-between">
                  <span className="text-sm font-semibold text-stone-700">Dimensions</span>
                  <span className="text-sm font-semibold text-stone-800">{dimensions}</span>
                </div>
              )}
              {platform && (
                <div className="flex items-center gap-5 justify-between">
                  <span className="text-sm font-semibold text-stone-700">Platform</span>
                  <span className="text-sm font-semibold text-stone-800 capitalize">{platform}</span>
                </div>
              )}
              {country && (
                <div className="flex items-center gap-5 justify-between">
                  <span className="text-sm font-semibold text-stone-700">Ships from</span>
                  <span className="text-sm font-semibold text-stone-800">{country}</span>
                </div>
              )}
            </div>

            <a
              href={extraction.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-600 hover:underline transition-colors"
            >
              <ExternalLinkIcon className="size-3" />
              View original listing
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Order options card */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Quantity */}
          <div>
            <p className="text-sm font-medium text-stone-700 mb-2">
              Quantity{" "}
              <span className="text-xs text-stone-400">(max 100)</span>
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1 || isLoading}
                aria-label="Decrease quantity"
              >
                <MinusIcon className="size-3.5" />
              </Button>
              <span className="w-8 text-center font-semibold text-stone-800 tabular-nums">
                {quantity}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setQuantity(Math.min(100, quantity + 1))}
                disabled={quantity >= 100 || isLoading}
                aria-label="Increase quantity"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Special instructions */}
          <div>
            <p className="text-sm font-medium text-stone-700 mb-2">
              Special Instructions
              <span className="ml-1.5 text-xs font-normal text-stone-400">optional</span>
            </p>
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Preferred colour: black, size: XL — or any specific product variant details"
              className="soft-input min-h-20 resize-none text-sm"
              maxLength={2000}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pricing preview */}
      {unsupportedRegion ? (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Pricing
            </p>
            <div className="flex justify-between text-sm text-stone-400">
              <span>Total</span>
              <span className="italic">Cannot be determined</span>
            </div>
            <p className="text-xs text-stone-400 pt-1">
              Pricing is unavailable for unsupported regions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pricingLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500">
              <LoaderCircleIcon className="size-4 animate-spin shrink-0" />
              Calculating pricing…
            </div>
          )}
          {!pricingLoading && pricing && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Estimated Pricing Breakdown
                </p>
                {pricing.pricing_method === "needs_review" ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                    <p className="font-medium">Pricing pending admin review</p>
                    <p className="text-xs mt-0.5 text-amber-600">
                      {pricing.review_reason ??
                        "We couldn\u0027t determine freight for this product."}{" "}
                      Our team will review and confirm the price after you submit.
                    </p>
                  </div>
                ) : (
                  <>
                    {[
                      { label: "Item price", value: `$${pricing.item_price_usd.toFixed(2)}` },
                      { label: `Subtotal (×${pricing.quantity})`, value: `$${pricing.subtotal_usd.toFixed(2)}` },
                      { label: `Tax (${(pricing.tax_percentage * 100).toFixed(0)}%)`, value: `$${pricing.tax_usd.toFixed(2)}` },
                      { label: `Value fee (${(pricing.value_fee_percentage * 100).toFixed(0)}%)`, value: `$${pricing.value_fee_usd.toFixed(2)}` },
                      { label: "Freight", value: `GH₵ ${pricing.flat_rate_ghs.toFixed(2)}` },
                      { label: "Exchange rate", value: `1 USD = ${pricing.exchange_rate} GHS` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-sm gap-4 text-stone-600">
                        <span>{label}</span>
                        <span className="tabular-nums">{value}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-base text-stone-900 pt-2 border-t border-stone-300">
                      <span>Total (GHS)</span>
                      <span className="tabular-nums">
                        {new Intl.NumberFormat("en-GH", {
                          style: "currency",
                          currency: "GHS",
                          minimumFractionDigits: 2,
                        }).format(pricing.total_ghs)}
                      </span>
                    </div>
                  </>
                )}
                <p className="text-xs text-stone-400 pt-1">
                  Estimate only — final total confirmed after admin review. Full
                  payment required before processing.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.history.back()}
          disabled={isLoading}
          className="gap-1.5"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={isLoading || unsupportedRegion}
          className="gap-1.5"
          onClick={() =>
            onSubmit({
              quantity,
              specialInstructions,
              pricing,
            })
          }
        >
          {isLoading ? (
            <>
              <Spinner />
              Submitting...
            </>
          ) : (
            <>
              <PackageCheckIcon className="size-4" />
              Submit Order
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <div className="space-y-4 fade-in">
      <Card className="overflow-hidden">
        <CardContent className="flex items-start gap-5 md:gap-8">
          <Skeleton className="shrink-0 size-28 sm:size-36 rounded-xl" />
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
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 space-y-5">
          <Skeleton className="h-4 w-20 rounded" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded" />
            <Skeleton className="w-8 h-6 rounded" />
            <Skeleton className="size-8 rounded" />
          </div>
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ReviewOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [extraction, setExtraction] = useState<ExtractionCacheResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const { mutateAsync: createOrder, isPending: isOrdering } = useCreateOrder();

  useEffect(() => {
    if (orderError) {
      toast.error({ title: "Failed to create order", description: orderError });
    }
  }, [orderError]);

  useEffect(() => {
    async function loadExtraction() {
      try {
        const res = await apiFetch<ApiSuccessResponse<ExtractionCacheResponse>>(
          `/api/extractions/${id}`,
        );
        setExtraction(res.data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load product data",
        );
      } finally {
        setLoading(false);
      }
    }
    loadExtraction();
  }, [id]);

  const handleSubmit = async (data: {
    quantity: number;
    specialInstructions: string;
    pricing: OrderPricingBreakdown | null;
  }) => {
    if (!extraction) return;
    setOrderError(null);

    const product = extraction.product;
    const reviewReasons: string[] = [];
    if (!extraction.extraction_success) reviewReasons.push("Automatic extraction failed");
    if (!product.title) reviewReasons.push("Product name could not be detected");
    if (product.price === null) reviewReasons.push("Price could not be detected");
    if (!extraction.country) reviewReasons.push("Origin country could not be determined");
    const needsReview = reviewReasons.length > 0;

    const orderPayload = {
      product_url: extraction.product_url,
      product_name: product.title ?? "",
      product_image_url: product.image ?? undefined,
      estimated_price_usd: product.price ?? 0,
      quantity: data.quantity,
      origin_country: extraction.country ?? "USA",
      special_instructions: data.specialInstructions || undefined,
      needs_review: needsReview,
      review_reasons: reviewReasons,
      extraction_metadata: extraction,
      extraction_cache_id: extraction.extraction_cache_id,
      pricing: data.pricing ?? undefined,
    };

    createOrder(orderPayload, {
      onSuccess: (result) => {
        if (!result.needs_review) {
          router.push(`/app/orders/${result.id}/checkout`);
          return;
        }
        setCreatedOrder({
          id: result.id,
          product_name: result.product_name,
          product_image_url: result.product_image_url,
          origin_country: result.origin_country,
          quantity: result.quantity,
          needs_review: result.needs_review,
          pricing: result.pricing,
        });
      },
      onError: (err) => setOrderError(err.message),
    });
  };

  return (
    <main>
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
          <h1 className="text-xl font-bold text-stone-800">
            {createdOrder ? "Order Placed" : "Review & Submit"}
          </h1>
        </div>
      </div>

      {loading && <ReviewSkeleton />}

      {error && (
        <Card>
          <CardContent className="flex flex-col items-center text-center space-y-4 py-10">
            <div className="size-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircleIcon className="size-7 text-destructive" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-stone-800">
                Product data unavailable
              </h3>
              <p className="text-sm text-stone-500 max-w-sm">{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/app")}
              className="gap-1.5"
            >
              <ArrowLeftIcon className="size-3.5" />
              Start Over
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && extraction && !createdOrder && (
        <ReviewForm
          extraction={extraction}
          isLoading={isOrdering}
          onSubmit={handleSubmit}
        />
      )}

      {createdOrder && (
        <OrderSuccess
          order={createdOrder}
          onReset={() => router.push("/app")}
        />
      )}
    </main>
  );
}
