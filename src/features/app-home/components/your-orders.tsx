import { StoreImage as Image } from "@/components/store-image";
import Link from "next/link";
import { ArrowRight, Moped } from "@phosphor-icons/react/ssr";

import { formatGhs } from "@/features/marketing/format";
import { stageIcon, tonePalette } from "@/features/journeys/components/stage-visuals";
import { cn } from "@/lib/utils";
import type { HomeOrder } from "../types";
import { formatOrderLatest, PLACEHOLDER_THUMB_CLASS, safeImageSrc } from "./format";
import { OrderJourneyTrack } from "./order-journey-track";

export interface YourOrdersProps {
  /** Placed orders (paid onwards), newest first, already capped by the service. */
  orders: readonly HomeOrder[];
  className?: string;
}

/**
 * "Your orders" — the customer's own orders, each with its own journey.
 *
 * Renders NOTHING when there are no orders: no empty card, no example journey.
 * A customer who has not bought anything has nothing to follow, and the rest of
 * Home is already about starting a purchase.
 */
export function YourOrders({ orders, className }: YourOrdersProps) {
  if (orders.length === 0) return null;

  return (
    <section
      aria-labelledby="your-orders-heading"
      className={cn(
        "tm-up flex min-w-0 flex-col gap-[18px] rounded-[24px] border border-tm-border bg-card p-4 sm:p-6",
        "[animation-delay:0.2s]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <h2
          id="your-orders-heading"
          className="font-display text-[22px] leading-none font-bold"
        >
          Your orders
        </h2>
        <Link
          href="/app/orders"
          className="inline-flex shrink-0 items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
        >
          See all orders
          <ArrowRight weight="bold" className="size-3.5" aria-hidden />
        </Link>
      </header>

      {/* `minmax(0,1fr)`: an implicit 1fr column grows to a truncated title's full width. */}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {orders.map((order, index) => (
          <li key={order.id} className="min-w-0">
            <OrderCard order={order} index={index} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrderCard({ order, index }: { order: HomeOrder; index: number }) {
  const image = safeImageSrc(order.productImageUrl);
  const eyebrow = [order.store, order.orderNo].filter(Boolean).join(" · ");

  return (
    <article
      className="tm-up relative flex min-w-0 flex-col gap-4 rounded-[16px] bg-tm-paper p-3.5 transition-shadow [animation-duration:0.5s] focus-within:ring-2 focus-within:ring-tm-coral hover:shadow-[0_6px_18px_-10px_rgba(60,30,10,0.35)]"
      style={{ animationDelay: `${(0.25 + index * 0.06).toFixed(2)}s` }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {image ? (
          <Image
            src={image}
            alt=""
            width={52}
            height={52}
            className="size-[52px] shrink-0 rounded-[12px] bg-card object-cover"
          />
        ) : (
          <span
            aria-hidden
            className={cn("size-[52px] shrink-0 rounded-[12px]", PLACEHOLDER_THUMB_CLASS)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          {eyebrow && (
            <span className="truncate text-[11px] leading-none font-semibold tracking-[0.04em] text-tm-text-3">
              {eyebrow}
            </span>
          )}
          <h3 className="truncate text-sm leading-[1.3] font-semibold">
            {/* The stretched link: the whole card opens the order, with one link in the tab order. */}
            <Link
              href={order.href}
              className="outline-none after:absolute after:inset-0 after:rounded-[16px] after:content-['']"
            >
              {order.productName}
            </Link>
          </h3>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {order.totalGhs !== null && (
              <span className="tm-nums text-xs leading-none font-semibold text-tm-text-2">
                {formatGhs(order.totalGhs)}
              </span>
            )}
            {/* Below `sm` the badge moves under the title so the title keeps its width. */}
            <StageBadge order={order} className="sm:hidden" />
          </div>
        </div>

        <StageBadge order={order} className="hidden sm:inline-flex" />
      </div>

      <OrderJourneyTrack track={order.track} eta={order.eta} />

      {order.rider && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs leading-none font-semibold text-tm-coral-strong">
          <Moped weight="duotone" className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Rider on the way</span>
          {order.rider.trackingUrl && (
            <>
              <span aria-hidden>·</span>
              {/* Above the stretched link, so it opens the ride rather than the order. */}
              <a
                href={order.rider.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-10 shrink-0 underline underline-offset-2 hover:text-tm-coral"
              >
                Track
              </a>
            </>
          )}
        </p>
      )}

      <p className="min-w-0 truncate text-xs leading-none font-medium text-tm-text-2">
        {formatOrderLatest(order.latest)}
      </p>
    </article>
  );
}

/** The stage word with its glyph, in the order's tone. */
function StageBadge({ order, className }: { order: HomeOrder; className?: string }) {
  const tone = tonePalette(order.tone);
  const Glyph = stageIcon(order.status);
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs leading-none font-semibold whitespace-nowrap",
        tone.badge,
        tone.text,
        className,
      )}
    >
      <Glyph weight="fill" className="size-3.5" aria-hidden />
      {order.stageLabel}
    </span>
  );
}
