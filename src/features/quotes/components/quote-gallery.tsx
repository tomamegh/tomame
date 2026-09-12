"use client";

import Image from "next/image";
import {
  ArrowSquareOut,
  BookmarkSimple,
  ShareNetwork,
} from "@phosphor-icons/react/ssr";

import {
  PLACEHOLDER_THUMB_CLASS,
  safeImageSrc,
} from "@/features/app-home/components/format";
import { cn } from "@/lib/utils";
import { buildGalleryRail } from "./format";

export interface QuoteThumbRailProps {
  /** Ordered gallery from the extraction; `images[0] === image` when both exist. */
  images: readonly string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * The 72px thumb rail: the first four images plus a "+N" tile for the rest.
 *
 * Its own component because the mock animates it on its own delay (.05s) in
 * the grid column beside the product, a fifth of a second before the product
 * column it belongs to.
 *
 * Renders nothing for a single image — a rail of one is a decoration, not a
 * control.
 */
export function QuoteThumbRail({
  images,
  selectedIndex,
  onSelect,
}: QuoteThumbRailProps) {
  const rail = buildGalleryRail(images, null);
  if (rail.thumbs.length < 2) return null;

  return (
    <ul className="tm-up flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0 [animation-delay:0.05s] [animation-duration:0.5s]">
      {rail.thumbs.map((thumb, index) => {
        const src = safeImageSrc(thumb);
        const selected = index === selectedIndex;
        return (
          <li key={`${thumb}-${index}`}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              aria-pressed={selected}
              className={cn(
                "relative size-[72px] shrink-0 overflow-hidden rounded-[12px] border-2 bg-white transition-colors",
                "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
                selected
                  ? "border-tm-coral"
                  : "border-transparent hover:border-tm-border",
                !src && PLACEHOLDER_THUMB_CLASS,
              )}
            >
              {src && (
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-contain p-1"
                />
              )}
            </button>
          </li>
        );
      })}

      {rail.overflow > 0 && (
        <li
          className="tm-nums flex size-[72px] shrink-0 items-center justify-center rounded-[12px] border border-tm-border bg-card text-xs leading-none font-semibold text-tm-text-3"
          aria-hidden
        >
          +{rail.overflow}
        </li>
      )}
    </ul>
  );
}

export interface QuoteMainImageProps {
  /** The image to show — already chosen from the gallery by the caller. */
  src: string | null;
  /** Alt text: the product title, or "" when the title could not be read. */
  title: string;
  /** Store display name for the badge, e.g. "Amazon". */
  storeName: string | null;
  productUrl: string;
  watching: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
  onShare: () => void;
}

/**
 * The 460px hero image with the store badge and the two round actions floated
 * over it.
 *
 * `object-contain` on white rather than `cover`: a store's own photography is
 * shot to fit, and cropping a pair of headphones to fill a 460px box is how a
 * quote screen starts showing a product that is not quite the one being
 * bought. The height is fixed at every breakpoint so swapping thumbs never
 * moves the page under the customer's cursor.
 */
export function QuoteMainImage({
  src,
  title,
  storeName,
  productUrl,
  watching,
  watchPending,
  onToggleWatch,
  onShare,
}: QuoteMainImageProps) {
  const image = safeImageSrc(src);

  return (
    <div
      className={cn(
        "relative h-[300px] w-full overflow-hidden rounded-[24px] bg-white sm:h-[380px] lg:h-[460px]",
        !image && PLACEHOLDER_THUMB_CLASS,
      )}
    >
      {image && (
        <Image
          src={image}
          alt={title}
          fill
          sizes="(min-width: 1024px) 640px, 100vw"
          priority
          className="object-contain p-6"
        />
      )}

      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 left-4 inline-flex max-w-[60%] items-center gap-2 truncate rounded-full bg-white px-3 py-2 text-[13px] leading-none font-semibold text-tm-ink shadow-[0_1px_3px_rgba(0,0,0,.08)] transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
      >
        {storeName ?? "View listing"}
        <ArrowSquareOut className="size-4 shrink-0 text-tm-text-3" aria-hidden />
      </a>

      <div className="absolute top-4 right-4 flex gap-2">
        <button
          type="button"
          onClick={onToggleWatch}
          disabled={watchPending}
          aria-pressed={watching}
          aria-label={watching ? "Watching this price" : "Watch this price"}
          className="flex size-10 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.08)] transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none disabled:opacity-60"
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
          className="flex size-10 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.08)] transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
        >
          <ShareNetwork className="size-[18px]" aria-hidden />
        </button>
      </div>
    </div>
  );
}
