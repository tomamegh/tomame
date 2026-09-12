"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookmarkSimple,
  ShareNetwork,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

/** Shared by the three 36px round controls on the row. */
const ROUND_BUTTON =
  "flex size-9 shrink-0 items-center justify-center rounded-full border border-tm-border bg-card transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none disabled:opacity-60";

export interface QuoteMobileHeaderProps {
  /** "Amazon", or the bare host — `formatStorePillLabel` decides. */
  storeLabel: string;
  productUrl: string;
  watching: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
  onShare: () => void;
}

/**
 * The 390px header — back, the store pill, watch and share.
 *
 * It replaces the breadcrumb below `lg`, and carries the two actions the
 * desktop floats over the hero image, because at 390px the image is 240px tall
 * and two buttons sitting on it would cover the product.
 *
 * The pill is a link to the listing rather than the artboard's inert chip: the
 * desktop badge opens the store, and a customer on a phone has no other way to
 * check the page they are about to be charged for. It shows the store's name as
 * text — the registry has no logo for the artboard's mark.
 */
export function QuoteMobileHeader({
  storeLabel,
  productUrl,
  watching,
  watchPending,
  onToggleWatch,
  onShare,
}: QuoteMobileHeaderProps) {
  return (
    <div className="tm-in flex items-center justify-between gap-3 lg:hidden [animation-duration:0.5s]">
      <Link href="/app" aria-label="Back to home" className={ROUND_BUTTON}>
        <ArrowLeft className="size-[18px]" aria-hidden />
      </Link>

      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center rounded-full border border-tm-border bg-card px-[11px] py-[7px] text-[12px] leading-none font-semibold transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
      >
        <span className="truncate">{storeLabel}</span>
      </a>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleWatch}
          disabled={watchPending}
          aria-pressed={watching}
          aria-label={watching ? "Watching this price" : "Watch this price"}
          className={ROUND_BUTTON}
        >
          <BookmarkSimple
            weight={watching ? "fill" : "regular"}
            className={cn("size-[18px]", watching && "text-tm-coral")}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label="Copy a link to this quote"
          className={ROUND_BUTTON}
        >
          <ShareNetwork className="size-[18px]" aria-hidden />
        </button>
      </div>
    </div>
  );
}
