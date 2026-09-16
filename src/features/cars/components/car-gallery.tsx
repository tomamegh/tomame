"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { CarProfile } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { CarPhotoView } from "../types";
import { galleryOrder } from "./labels";

export interface CarGalleryProps {
  photos: readonly CarPhotoView[];
  /** The car's name. Used as the empty state's label and the group's accessible name. */
  title: string;
  className?: string;
}

/**
 * The photographs, cover first.
 *
 * WHY THIS ONE IS A CLIENT COMPONENT when the rest of the car screens are not:
 * choosing which picture to look at is state that belongs to the person
 * looking. Every alternative was worse — a URL query parameter would put
 * `?photo=3` in the link a buyer sends to a customer, and a CSS-only
 * radio-and-sibling gallery cannot be operated by a screen reader in a way
 * that says what changed. The island is this component and nothing else; the
 * spec table, the price and the description around it stay server-rendered.
 *
 * COVER FIRST, ALWAYS. `listCarPhotos` sorts by `sort_order` alone, so the
 * photograph the admin MARKED as the cover is not necessarily the first row.
 * `galleryOrder` lifts it to the front, which is what makes the card and this
 * page open on the same picture — a customer who taps a silver Highlander and
 * lands on a photo of its boot has been shown two different cars.
 *
 * THE FIRST IMAGE IS `priority`. It is the largest thing above the fold on the
 * one screen whose entire job is "look at the car", and letting it lazy-load
 * costs the page its own headline.
 *
 * Photo URLs are relative (`/api/cars/photos/<id>`) and go to `next/image`
 * exactly as they are — never through `safeImageSrc`, which calls `new URL()`
 * and returns null for a relative path, silently blanking every car photo.
 */
export function CarGallery({ photos, title, className }: CarGalleryProps) {
  const ordered = useMemo(() => galleryOrder(photos), [photos]);
  const [activeId, setActiveId] = useState<string | null>(ordered[0]?.id ?? null);

  // Derived rather than held as an index: an id survives the list changing
  // underneath it, and an index silently points at a different car's
  // photograph if it does.
  const active = ordered.find((photo) => photo.id === activeId) ?? ordered[0] ?? null;

  if (!active) {
    return (
      <div
        className={cn(
          "flex aspect-[16/10] w-full min-w-0 items-center justify-center rounded-[20px] border border-tm-border bg-tm-pill-bg text-tm-text-3",
          className,
        )}
      >
        <span className="flex flex-col items-center gap-2 px-6 text-center">
          <CarProfile weight="duotone" className="size-10" aria-hidden />
          <span className="text-[13px] leading-[1.4] font-semibold">
            No photographs of {title} yet
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <div className="relative aspect-[16/10] w-full min-w-0 overflow-hidden rounded-[20px] border border-tm-border bg-tm-pill-bg">
        <Image
          key={active.id}
          src={active.url}
          alt={active.alt}
          fill
          sizes="(min-width: 1024px) 660px, 96vw"
          priority
          className="object-cover"
        />
      </div>

      {ordered.length > 1 && (
        <div
          role="group"
          aria-label={`Photographs of ${title}`}
          /*
            `overscroll-x-contain` is not decoration. Without it a rightward
            flick at scroll-left 0 inside this track hands the gesture to the
            page, and in the installed PWA that is iOS's back-swipe — a customer
            trying to see the next photograph is thrown off the listing.
            `department-row.tsx` carries the same guard for the same reason.
          */
          className="-mx-1 flex min-w-0 snap-x gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ordered.map((photo, index) => {
            const selected = photo.id === active.id;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setActiveId(photo.id)}
                aria-pressed={selected}
                // The alt text is the same sentence for every photograph of a
                // car, so it cannot distinguish the thumbnails from one
                // another. The position can.
                aria-label={`Show photograph ${index + 1} of ${ordered.length}`}
                className={cn(
                  "relative size-[68px] shrink-0 snap-start overflow-hidden rounded-[12px] border-[1.5px] bg-tm-pill-bg transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
                  selected ? "border-tm-coral" : "border-tm-border hover:border-tm-coral/40",
                )}
              >
                <Image
                  src={photo.url}
                  alt=""
                  fill
                  sizes="68px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
