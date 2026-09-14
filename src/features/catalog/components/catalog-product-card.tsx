import Image from "next/image";
import Link from "next/link";
import { Star } from "@phosphor-icons/react/ssr";

import {
  PLACEHOLDER_THUMB_CLASS,
  safeImageSrc,
} from "@/features/app-home/components/format";
import { formatGhs, formatUsdCompact } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "../types";
import {
  catalogQuoteHref,
  catalogStoreLabel,
  formatCatalogRating,
  formatPriceAge,
} from "./format";

export interface CatalogProductCardProps {
  product: CatalogProduct;
  /** One clock for the whole render, so every card agrees on how old a price is. */
  now: Date;
  /** `compact` is the rail beside a quote: shorter image, smaller type. */
  size?: "default" | "compact";
  className?: string;
}

/**
 * One pre-priced product.
 *
 * The whole card is a single link into the ORDINARY quote flow
 * (`/app/orders/new?url=`), not a second way to order: tapping it re-reads the
 * listing live and prices it through the same path a pasted link takes. One
 * anchor rather than a card full of controls, so a keyboard reaches each
 * product in one stop and a screen reader hears one destination.
 *
 * Two honesty rules are load-bearing here:
 *
 * 1. A row the server marked `unpriceable` prints NO figure. It says so, and it
 *    still leads into the quote flow, which is the one thing that can produce a
 *    real price for it.
 * 2. The price is a reading, not a promise. Every card carries the age of that
 *    reading, and one older than a week says so in amber rather than in grey.
 */
export function CatalogProductCard({
  product,
  now,
  size = "default",
  className,
}: CatalogProductCardProps) {
  const compact = size === "compact";
  const src = safeImageSrc(product.image_url);
  const age = formatPriceAge(product.last_seen_at, now);
  const rating = formatCatalogRating(product.rating, product.review_count);
  const store = catalogStoreLabel(product.store);
  const priced = !product.unpriceable && product.total_ghs != null;

  return (
    /* `min-w-0` is load-bearing: the title clamps, and without a zero floor the
       grid column sizes itself to the longest word of an Amazon title and the
       whole page grows wider than the phone. */
    <li className={cn("min-w-0", className)}>
      <Link
        href={catalogQuoteHref(product.product_url)}
        className={cn(
          "group flex h-full min-w-0 flex-col gap-3 rounded-[20px] border border-tm-border bg-card p-3 transition-colors",
          "hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
        )}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-[14px] bg-white",
            compact ? "h-[110px]" : "h-[150px] sm:h-[170px]",
            !src && PLACEHOLDER_THUMB_CLASS,
          )}
        >
          {src && (
            <Image
              src={src}
              alt=""
              fill
              sizes={compact ? "200px" : "(min-width: 1024px) 260px, 50vw"}
              className="max-w-full object-contain p-2"
            />
          )}

          {product.cheapest_in_store && priced && !compact && (
            <span className="absolute top-2 left-2 rounded-full bg-tm-tint px-2 py-1 text-[11px] leading-none font-bold text-tm-coral-strong">
              Cheapest on {store}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-none font-semibold text-tm-text-3">
            <span className="truncate">{store}</span>
            {rating && (
              <>
                <span aria-hidden>·</span>
                <span className="tm-nums flex shrink-0 items-center gap-0.5">
                  <Star
                    weight="fill"
                    className="size-3 text-tm-coral"
                    aria-hidden
                  />
                  {rating}
                </span>
              </>
            )}
          </p>

          <h3
            className={cn(
              "min-w-0 line-clamp-2 font-sans leading-[1.3] font-semibold tracking-normal text-tm-ink",
              compact ? "text-[12.5px]" : "text-[13.5px]",
            )}
          >
            {product.title}
          </h3>

          <div className="mt-auto flex flex-col gap-1 pt-1">
            {priced ? (
              <>
                <p
                  className={cn(
                    "tm-nums leading-none font-bold text-tm-ink",
                    compact ? "text-[15px]" : "text-[18px]",
                  )}
                >
                  {formatGhs(product.total_ghs as number)}
                  <span className="sr-only"> delivered to your door</span>
                </p>
                <p className="text-[11.5px] leading-none font-medium text-tm-text-3">
                  {product.price_usd != null && product.price_usd > 0
                    ? `${formatUsdCompact(product.price_usd)} listed, landed in GH₵`
                    : "landed in GH₵"}
                </p>
              </>
            ) : (
              <>
                <p
                  className={cn(
                    "leading-none font-bold text-tm-text-2",
                    compact ? "text-[13px]" : "text-[14px]",
                  )}
                >
                  No price yet
                </p>
                <p className="text-[11.5px] leading-[1.35] font-medium text-tm-text-3">
                  We could not work out a cedi total for this listing. Open it
                  and we will price it live.
                </p>
              </>
            )}

            {age && (
              <p
                className={cn(
                  "text-[11px] leading-none font-medium",
                  age.stale ? "text-tm-amber" : "text-tm-text-3",
                )}
              >
                {age.label}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
