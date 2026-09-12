import type { ReactNode } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { formatGhs, formatUsd } from "@/features/marketing/format";
import {
  PLACEHOLDER_THUMB_CLASS,
  safeImageSrc,
} from "@/features/app-home/components/format";
import type { WatchListItem } from "../types";
import {
  directionTextClass,
  formatLastChecked,
  watchDisplayName,
  watchStoreLabel,
} from "./format";
import { WatchSparklineBars } from "./watch-sparkline";

/**
 * `compact` is the Home card's row, at the mock's literal 44px / 13px / 14px
 * scale. `page` is the same anatomy at the size a dedicated screen can afford,
 * with the provenance line and a slot for the remove control.
 */
export type WatchRowScale = "compact" | "page";

export interface WatchRowProps {
  /** One entry from `listWatches()`. Stats are already derived server-side. */
  item: WatchListItem;
  scale?: WatchRowScale;
  /**
   * Reference instant for "checked 6 hrs ago". Always passed in, never read
   * from the clock here, so every row in one render agrees about the time and
   * so the server render and the client hydration cannot disagree.
   *
   * Only the `page` scale prints it — which is why this is optional rather than
   * required — but when that scale is used it MUST be supplied. A default of
   * `new Date()` here would be the optional-parameter trap the handoff warns
   * about: rows straddling a minute boundary would disagree with each other,
   * silently. `page` therefore falls back to an explicit "recently" rather than
   * inventing a second clock.
   */
  now?: Date;
  /** Trailing control — the page passes its remove button island in here. */
  action?: ReactNode;
  className?: string;
}

const SCALE = {
  compact: {
    thumb: "size-11 rounded-[10px]",
    thumbPx: 44,
    name: "text-[13px] leading-[1.3]",
    sparkHeight: 14,
    sparkBar: 6,
    // Size and leading travel together: tailwind-merge treats a font-size
    // utility as conflicting with `leading-*`, so a separate `leading-none`
    // later in the same `cn()` call is silently dropped.
    total: "text-sm leading-none",
    delta: "text-[11px] leading-none",
  },
  page: {
    thumb: "size-14 rounded-[12px]",
    thumbPx: 56,
    name: "text-sm leading-[1.35]",
    sparkHeight: 18,
    sparkBar: 7,
    total: "text-base leading-none",
    delta: "text-xs leading-none",
  },
} as const;

/**
 * One watched product: thumbnail, name, sparkline, the GH₵ the customer would
 * pay today, and what the price has done.
 *
 * THE ONE RULE THIS COMPONENT ENFORCES. Nothing is computed here. `delta_label`
 * is the headline and it is USD-derived; when it is null there is no trend, and
 * the row prints `status_label` ("not checked yet" / "no change yet") in a
 * neutral tone instead of dressing a zero up as news. `delta_ghs` is never
 * shown as a price move — it carries the day's FX with it.
 */
export function WatchRow({
  item,
  scale = "compact",
  now,
  action,
  className,
}: WatchRowProps) {
  const { watch, stats } = item;
  const size = SCALE[scale];
  const isPage = scale === "page";

  const name = watchDisplayName(watch);
  const image = safeImageSrc(watch.product_image_url);
  const store = watchStoreLabel(watch.product_url);

  // The label always exists; `delta_label` is the trend and `status_label` the
  // honest fallback, so the colour has to follow which one we are printing.
  const hasTrend = stats.delta_label != null;
  const label = stats.delta_label ?? stats.status_label;
  const labelTone = hasTrend
    ? directionTextClass(stats.direction)
    : "text-tm-text-3";

  return (
    <article
      className={cn(
        "grid items-center",
        isPage
          ? "grid-cols-[56px_minmax(0,1fr)] gap-x-3.5 gap-y-3 py-4 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:gap-x-4"
          : "grid-cols-[44px_minmax(0,1fr)_auto] gap-3 py-2.5",
        className,
      )}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          width={size.thumbPx}
          height={size.thumbPx}
          // Decorative: the product name sits beside it in text.
          className={cn("shrink-0 object-cover", size.thumb)}
        />
      ) : (
        <div
          className={cn("shrink-0", size.thumb, PLACEHOLDER_THUMB_CLASS)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-col gap-[5px]">
        {isPage ? (
          <a
            href={watch.product_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn(
              "truncate font-semibold outline-none",
              "hover:text-tm-coral focus-visible:text-tm-coral focus-visible:underline",
              size.name,
            )}
          >
            {name}
          </a>
        ) : (
          <p className={cn("truncate font-semibold", size.name)}>{name}</p>
        )}

        <WatchSparklineBars
          sparkline={stats.sparkline}
          height={size.sparkHeight}
          barWidth={size.sparkBar}
        />

        {isPage && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-[1.4] font-medium text-tm-text-3">
            <span>
              {now
                ? formatLastChecked(watch.last_checked_at, now)
                : watch.last_checked_at
                  ? "checked recently"
                  : "not checked yet"}
            </span>
            {stats.current_price_usd !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="tm-nums">
                  {formatUsd(stats.current_price_usd)}
                </span>
              </>
            )}
            {store && (
              <>
                <span aria-hidden>·</span>
                <span>{store}</span>
              </>
            )}
          </p>
        )}
      </div>

      <div
        className={cn(
          "flex items-center gap-4",
          isPage
            ? "col-span-2 justify-between sm:col-span-1 sm:justify-end"
            : "justify-end",
        )}
      >
        <div className="flex flex-col items-end gap-1 text-right">
          {stats.current_total_ghs !== null && (
            <span
              className={cn(
                "tm-nums font-bold whitespace-nowrap",
                size.total,
              )}
            >
              {formatGhs(stats.current_total_ghs)}
            </span>
          )}
          <span
            className={cn(
              "font-semibold whitespace-nowrap",
              size.delta,
              labelTone,
            )}
          >
            {label}
          </span>
        </div>

        {action}
      </div>
    </article>
  );
}
