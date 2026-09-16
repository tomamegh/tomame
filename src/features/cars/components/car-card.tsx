import Image from "next/image";
import Link from "next/link";
import { CarProfile } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { carTitle, formatMileage, originLabel } from "../format";
import { CarActions } from "./car-actions";
import type { CarWithCover } from "../services/cars.service";
import { CarPriceBlock } from "./car-price-block";
import {
  RIBBON_TONE_CLASS,
  fuelLabel,
  shortTransmissionLabel,
  voyageRibbon,
} from "./labels";

export interface CarCardProps {
  entry: CarWithCover;
  /** The render's ISO day, so every ribbon in a grid agrees about what has landed. */
  today: string;
  /** `rail` is the Home shelf: a fixed-width tile in a horizontal scroller. */
  variant?: "grid" | "rail";
  className?: string;
}

/**
 * One car.
 *
 * NOT ONE BIG ANCHOR, and that is the one place this card departs from
 * `CatalogProductCard`. A catalogue product has a single destination and no
 * controls, so wrapping the whole tile in a `<Link>` gives a keyboard one stop
 * and a screen reader one announcement. A car has ACTIONS on it — buying a car
 * is the point of the shelf, not a thing you go elsewhere to do — and a
 * `<button>` inside an `<a>` is invalid markup that browsers resolve by
 * swallowing one of them. So the picture, the name and the price are one link
 * into the detail page, the action row sits outside it, and the card is two tab
 * stops rather than one.
 *
 * THE PHOTOGRAPH IS RENDERED FROM A RELATIVE PATH, DELIBERATELY. `cover.url` is
 * `/api/cars/photos/<id>` and must go to `next/image` exactly as it is. It must
 * NOT be passed through `safeImageSrc` (`features/app-home/components/format.ts`),
 * which is written for scraped third-party URLs and calls `new URL(value)` —
 * that throws on a relative path, the helper returns null, and every car photo
 * on the site silently disappears with no error anywhere. `next.config.ts`
 * allowlists `/api/cars/photos/**` in `localPatterns`, without which
 * `next/image` refuses a same-origin path outright.
 *
 * 16:10, not the catalogue's fixed pixel height. A car photograph is a
 * landscape shot of one object and the aspect ratio is what keeps a row of them
 * looking like a forecourt; `aspect-[16/10]` also means the box has a height
 * before the bytes land, so a grid does not reflow as the pictures arrive.
 *
 * A Server Component. The only client island is the action row.
 */
export function CarCard({ entry, today, variant = "grid", className }: CarCardProps) {
  const { car, cover } = entry;
  const title = carTitle(car);
  const ribbon = voyageRibbon(car, today);
  const rail = variant === "rail";

  // The thin strip under the name. Every part is omitted rather than defaulted:
  // a car with no odometer reading prints no mileage, because "0 mi" is a claim
  // and a flattering one. `formatMileage` never converts between units.
  const specs = [
    formatMileage(car.mileage, car.mileage_unit),
    fuelLabel(car.fuel),
    shortTransmissionLabel(car.transmission),
    originLabel(car.origin_country),
  ].filter((part): part is string => Boolean(part));

  return (
    /* `min-w-0` is load-bearing. The name clamps and the spec strip wraps, and
       without a zero floor the grid column sizes itself to the longest of them
       and the whole page grows wider than the phone. */
    <li
      className={cn(
        "min-w-0",
        /* A fixed tile width inside an `overflow-x-auto` box is the only shape
           that cannot widen the page. 296px leaves ~1.15 cards visible on a
           390px phone and 358px leaves 3 plus a peek at 1280 — the peek is the
           thing that tells a customer the row scrolls at all. */
        rail && "w-[296px] shrink-0 snap-start lg:w-[358px]",
        className,
      )}
    >
      <article
        className={cn(
          "flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-tm-border bg-card",
          "transition-colors focus-within:border-tm-coral/40 hover:border-tm-coral/30",
        )}
      >
        <Link
          href={`/app/cars/${car.slug}`}
          className={cn(
            "group flex min-w-0 flex-col gap-3 rounded-t-[20px]",
            "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-inset focus-visible:outline-none",
          )}
        >
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-tm-pill-bg">
            {cover ? (
              <Image
                src={cover.url}
                alt={cover.alt}
                fill
                sizes={
                  rail
                    ? "(min-width: 1024px) 358px, 296px"
                    : "(min-width: 1024px) 380px, (min-width: 640px) 45vw, 92vw"
                }
                className="object-cover"
              />
            ) : (
              <span
                className="flex size-full items-center justify-center text-tm-text-3"
                aria-hidden
              >
                <CarProfile weight="duotone" className="size-10" />
              </span>
            )}

            {/* The ribbon is boxed by an inset wrapper rather than a
                `max-w-[calc(100%-…)]` on the pill itself: tailwind-merge has
                been caught dropping arbitrary `calc()` values out of a
                `cn()`ed className, and the failure mode is a long ETA running
                off the photograph with nothing in the console. */}
            {ribbon && (
              <div className="absolute top-3 right-3 left-3 flex min-w-0">
                <span
                  className={cn(
                    "min-w-0 truncate rounded-full px-2.5 py-1 text-[11px] leading-none font-bold",
                    RIBBON_TONE_CLASS[ribbon.tone],
                  )}
                >
                  {ribbon.text}
                </span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2 px-4">
            <h3 className="min-w-0 line-clamp-2 font-sans text-[15px] leading-[1.25] font-bold tracking-normal text-tm-ink">
              {title}
            </h3>

            {/* Wraps rather than truncates. A truncated strip in a track that
                can still grow reports a width it never shows, which is exactly
                what has widened this app's phone layouts before. */}
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] leading-[1.3] font-semibold text-tm-text-3">
              {specs.map((spec, index) => (
                <span key={spec} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && <span aria-hidden>·</span>}
                  {spec}
                </span>
              ))}
            </p>

            <CarPriceBlock listing={car} className="pt-0.5" />
          </div>
        </Link>

        <div className="mt-auto px-4 pt-3 pb-4">
          <CarActions
            carListingId={car.id}
            slug={car.slug}
            title={title}
            priceState={car.price_state}
            pricePesewas={car.price_pesewas}
            size="compact"
          />
        </div>
      </article>
    </li>
  );
}
