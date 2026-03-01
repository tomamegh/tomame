"use client";

import {
  ExternalLinkIcon,
  AlertTriangleIcon,
  ShoppingCartIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  PackageSearchIcon,
} from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProductPreviewProps } from "@/features/extraction/types";
import Image from "next/image";

const CONFIDENCE_CONFIG = {
  high: {
    label: "Verified",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    dot: "bg-emerald-500",
  },
  medium: {
    label: "Estimated",
    className: "bg-amber-50 text-amber-700 border-amber-200/60",
    dot: "bg-amber-500",
  },
  low: {
    label: "Low confidence",
    className: "bg-orange-50 text-orange-600 border-orange-200/60",
    dot: "bg-orange-500",
  },
} as const;

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low" | null;
}) {
  if (!confidence) return null;
  const config = CONFIDENCE_CONFIG[confidence];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <span className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function ProductPreview({
  data,
  productUrl,
  onOrder,
  onReset,
}: ProductPreviewProps) {
  const { fields, extractionSuccess } = data;

  const name = fields.name.value as string | null;
  const price =
    typeof fields.price.value === "number"
      ? fields.price.value
      : typeof fields.price.value === "string"
        ? parseFloat(fields.price.value)
        : null;
  const priceNum = price !== null && !isNaN(price) ? price : null;
  const currency = fields.price.currency ?? "USD";
  const image = fields.image.value as string | null;
  const country = fields.country.value as string | null;

  const hasLowConfidence =
    fields.name.confidence === "low" || fields.price.confidence === "low";
  const isMissingCritical = !name || priceNum === null;
  const showWarning =
    !extractionSuccess || hasLowConfidence || isMissingCritical;

  return (
    <div className="space-y-3 fade-in">
      {/* Status banner */}
      {!extractionSuccess ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Partial extraction</p>
            <p className="text-amber-700/80 text-xs mt-0.5">
              We couldn&apos;t automatically read all product details. You can
              still proceed — our team will verify the information before
              processing.
            </p>
          </div>
        </div>
      ) : showWarning ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Please verify product details</p>
            <p className="text-amber-700/80 text-xs mt-0.5">
              Some fields have lower confidence. Review and correct the details
              on the next step before placing your order.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-xl px-4 py-2.5">
          <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
          <span className="font-medium">
            Product details extracted successfully
          </span>
        </div>
      )}

      {/* Product card */}
      <Card className="overflow-hidden">
        <CardContent className="flex start gap-5 md:gap-8">
          {/* Product image */}
          <div className="shrink-0">
            {image ? (
              <div className="relative size-28 sm:size-36 lg:size-40 lg:h-46 rounded-xl overflow-hidden border border-stone-200/60 bg-stone-50 flex items-center justify-center">
                <Image
                  src={image}
                  alt={name ?? "Product image"}
                  width={120}
                  height={120}
                  className="w-full h-full object-contain p-2"
                  // onError={(e) => {
                  //   e.currentTarget.style.display = "none";
                  //   e.currentTarget.nextElementSibling?.classList.remove(
                  //     "hidden"
                  //   );
                  // }}
                />
                <PackageSearchIcon className="hidden size-10 text-stone-300" />
              </div>
            ) : (
              <div className="size-28 sm:size-36 lg:size-40 lg:h-46 rounded-xl border border-stone-200/60 bg-stone-50 flex items-center justify-center">
                <ShoppingCartIcon className="size-10 text-stone-300" />
              </div>
            )}
          </div>

          {/* Product details */}
          <div className="flex-1 min-w-0 space-y-3.5 md:space-y-5">
            {/* Name */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Product
                </p>
                <ConfidenceBadge confidence={fields.name.confidence} />
              </div>
              <p className="font-semibold text-stone-800 leading-snug line-clamp-3 text-sm">
                {name ?? (
                  <span className="text-stone-400 italic text-sm">
                    Not detected — enter manually below
                  </span>
                )}
              </p>
            </div>

            {/* Price & Country */}
            <div className="space-y-1.5 w-full md:w-1/3">
              {/* Price */}
              <div className="flex items-center gap-4 justify-between">
                <span className="text-sm font-semibold text-stone-700 block">
                  Price:
                </span>
                {priceNum ? (
                  <div className=" text-stone-800 self-end">
                    <span className="text-xs font-medium text-stone-500 mr-0.5">
                      {currency}
                    </span>
                    <p className="text-bold text-base inline-block">
                      {priceNum.toFixed(2)}
                    </p>
                  </div>
                ) : (
                  <p className="text-stone-800 italic text-sm self-end">
                    Not detected
                  </p>
                )}
              </div>

              {/* Origin country */}
              {country && (
                <div className="flex items-center gap-2 justify-between">
                  <p className="text-sm font-semibold text-stone-700">
                    Platform
                  </p>
                  <p className="font-semibold text-stone-800 text-sm self-end">
                    {country}
                  </p>
                </div>
              )}
              {/* Origin country */}
              {country && (
                <div className="flex items-center gap-2 justify-between">
                  <p className="text-sm font-semibold text-stone-700">
                    Ships from
                  </p>
                  <p className="font-semibold text-stone-800 text-sm self-end">
                    {country}
                  </p>
                </div>
              )}
            </div>

            {/* Source link */}
            <a
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-600 hover:underline transition-colors"
            >
              <ExternalLinkIcon className="size-3" />
              View original listing
            </a>
          </div>
          {/* </div> */}
        </CardContent>
        <CardFooter className="justify-between border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="gap-1.5"
          >
            <RefreshCwIcon className="size-3.5" />
            Try another URL
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onOrder}
            className="gap-1.5"
          >
            <ShoppingCartIcon className="size-3.5" />
            Place Order
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
