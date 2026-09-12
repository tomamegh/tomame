"use client";

import { useCallback, useEffect, useRef } from "react";
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
 * control — and nothing at all below `lg`: the 390px artboard has no rail,
 * because the gallery itself becomes swipeable there.
 */
export function QuoteThumbRail({
  images,
  selectedIndex,
  onSelect,
}: QuoteThumbRailProps) {
  const rail = buildGalleryRail(images, null);
  if (rail.thumbs.length < 2) return null;

  return (
    <ul className="tm-up hidden gap-2 pb-1 lg:flex lg:flex-col lg:overflow-visible lg:pb-0 [animation-delay:0.05s] [animation-duration:0.5s]">
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

export interface QuoteGalleryProps {
  /** Ordered gallery from the extraction; empty renders the hatch placeholder. */
  images: readonly string[];
  /** Alt text: the product title, or "" when the title could not be read. */
  title: string;
  /** Store display name for the badge, e.g. "Amazon". */
  storeName: string | null;
  productUrl: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  watching: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
  onShare: () => void;
}

/**
 * The product gallery: 460px on desktop, 240px at 390px, and the same DOM at
 * both.
 *
 * It is a scroll-snap track rather than a single swapped `<img>` so the 390px
 * artboard's swipe is real — the finger moves the images, and the dot row
 * underneath reports which one landed. The desktop thumb rail drives the same
 * `selectedIndex`, so a thumb click scrolls the track; the scroll handler then
 * reports the index it arrived at, which is the same one, so the two cannot
 * fight.
 *
 * `object-contain` on white rather than `cover`: a store's own photography is
 * shot to fit, and cropping a pair of headphones to fill the box is how a quote
 * screen starts showing a product that is not quite the one being bought. The
 * height is fixed per breakpoint so swapping images never moves the page under
 * the customer.
 *
 * The store badge and the two round actions are desktop-only — at 390px they
 * live in `QuoteMobileHeader`, where the artboard puts them.
 */
export function QuoteGallery({
  images,
  title,
  storeName,
  productUrl,
  selectedIndex,
  onSelect,
  watching,
  watchPending,
  onToggleWatch,
  onShare,
}: QuoteGalleryProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // True while a scroll WE started is still travelling. Without it the frames
  // in between retarget the animation — a tap on the last dot reports the
  // images it passes, and the track strands on one nobody asked for.
  const programmaticScroll = useRef(false);

  const slides = images
    .map((image) => safeImageSrc(image))
    .filter((image): image is string => Boolean(image));

  // The track is the source of truth for "which image is showing", so a swipe
  // and a thumb click converge on the same state instead of each keeping their
  // own idea of it.
  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);

    if (programmaticScroll.current) {
      if (index === selectedIndex) programmaticScroll.current = false;
      return;
    }

    if (index !== selectedIndex) onSelect(index);
  }, [onSelect, selectedIndex]);

  /** A finger on the track takes it back, wherever our own scroll had got to. */
  const handlePointerDown = useCallback(() => {
    programmaticScroll.current = false;
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const target = selectedIndex * track.clientWidth;
    // Within a pixel means the scroll that produced this index is the one
    // already on screen — scrolling again would interrupt the user's own swipe.
    if (Math.abs(track.scrollLeft - target) <= 1) return;
    programmaticScroll.current = true;
    track.scrollTo({ left: target, behavior: scrollBehaviour() });
  }, [selectedIndex]);

  return (
    <div className="relative h-[240px] w-full overflow-hidden rounded-[22px] bg-white sm:h-[380px] lg:h-[460px] lg:rounded-[24px]">
      {slides.length > 0 ? (
        <div
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          role="group"
          aria-roledescription="carousel"
          aria-label={title || "Product images"}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((src, index) => (
            <div
              key={`${src}-${index}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`Image ${index + 1} of ${slides.length}`}
              className="relative h-full w-full shrink-0 snap-center"
            >
              <Image
                src={src}
                alt={index === 0 ? title : ""}
                fill
                sizes="(min-width: 1024px) 640px, 100vw"
                priority={index === 0}
                className="object-contain p-4 lg:p-6"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={cn("h-full w-full", PLACEHOLDER_THUMB_CLASS)} />
      )}

      {slides.length > 1 && (
        <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-40px)] -translate-x-1/2 gap-[5px] overflow-hidden lg:hidden">
          {slides.map((src, index) => (
            <button
              key={`dot-${src}-${index}`}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Show image ${index + 1} of ${slides.length}`}
              aria-current={index === selectedIndex}
              /* The dot is the mock's 16x6 / 6x6; the padding around it is the
                 touch target, cancelled by the negative margin so the gap the
                 artboard draws survives. */
              className="-my-[9px] -mx-[5px] flex h-6 items-center px-[5px] focus-visible:outline-none"
            >
              <span
                /* The artboard's white dots sit on a hatched placeholder; a
                   real listing photo is usually white, so they carry a hairline
                   shadow to stay visible on one. */
                className={cn(
                  "h-[6px] rounded-[3px] shadow-[0_0_0_0.5px_rgba(43,36,34,.12),0_1px_2px_rgba(43,36,34,.20)] transition-[width,background-color] duration-200",
                  index === selectedIndex
                    ? "w-4 bg-tm-coral"
                    : "w-[6px] bg-white",
                )}
              />
            </button>
          ))}
        </div>
      )}

      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 left-4 hidden max-w-[60%] items-center gap-2 truncate rounded-full bg-white px-3 py-2 text-[13px] leading-none font-semibold text-tm-ink shadow-[0_1px_3px_rgba(0,0,0,.08)] transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none lg:inline-flex"
      >
        {storeName ?? "View listing"}
        <ArrowSquareOut className="size-4 shrink-0 text-tm-text-3" aria-hidden />
      </a>

      <div className="absolute top-4 right-4 hidden gap-2 lg:flex">
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

/**
 * The global `prefers-reduced-motion` guard in `globals.css` cannot reach a
 * programmatic `scrollTo`, so the preference is read here instead.
 */
function scrollBehaviour(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
