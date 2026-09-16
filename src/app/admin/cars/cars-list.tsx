import Link from "next/link";
import { CameraOffIcon, ChevronRightIcon, ShipIcon } from "lucide-react";

import { AdminBadge, type AdminTone } from "@/components/layout/admin";
import {
  carTitle,
  formatEta,
  formatMileage,
  originLabel,
  priceLabel,
  voyageStage,
  type CarVoyageStage,
} from "@/features/cars/format";
import type { CarListingView, CarPhotoView } from "@/features/cars/types";
import { cn } from "@/lib/utils";

/**
 * The admin's car list.
 *
 * A SERVER component. Nothing on it has state — the filter lives in the URL and
 * every row is a link — so nothing here needs to ship to the browser, and the
 * entrance animation is the v2 `tm-up` keyframe rather than a hydration boundary
 * spent on a stagger.
 *
 * WHAT A ROW LEADS WITH, AND WHY.
 *
 *   THE PICTURE. A car listing with no photograph is the one thing it may not
 *   be — `setCarPublished` refuses to put one on the site — so a missing cover
 *   is not a cosmetic gap on this screen, it is the reason the car cannot be
 *   published. A row without one says so in words rather than showing a grey
 *   rectangle and leaving the admin to work it out.
 *
 *   DRAFT VERSUS PUBLISHED, AT A GLANCE. Both states are ordinary and long-lived
 *   here: a car is written up weeks before its price is agreed. So the
 *   distinction is carried by the badge AND by the row's own surface — a draft
 *   sits on `tm-paper` with a muted cover — because a single small pill is not
 *   enough to tell twenty rows apart while scrolling.
 *
 * `photo.url` IS RENDERED AS IT ARRIVES — a relative `/api/cars/photos/<id>`.
 * It must not be passed through `safeImageSrc` (`features/app-home/components/
 * format.ts`), which is written for scraped third-party URLs and calls
 * `new URL(value)`: that throws on a relative path, the helper returns null, and
 * every photograph on this screen silently disappears.
 *
 * AND IT IS A PLAIN `img`, NOT `next/image`, for the reason the parcel-photo
 * panel gives about its own private route: THE IMAGE OPTIMISER IS ALWAYS AN
 * ANONYMOUS CALLER. `/_next/image` re-fetches the source itself, server side,
 * without the browser's cookies — and `/api/cars/photos/[photoId]` re-checks the
 * listing's publish state on every request, so a DRAFT's photographs are served
 * to an admin and to nobody else. Verified against the running dev server: a
 * published car's photo is 200 through the optimiser, and a draft's is 400 ("The
 * requested resource isn't a valid image") while the same URL fetched by the
 * browser with the admin's session answers 200 image/webp.
 *
 * This list shows drafts and published cars together — that is the whole point
 * of it — so routing these through the optimiser would blank exactly the rows an
 * admin most needs to look at. `next.config.ts` allowlists the path under
 * `localPatterns` for the storefront, where every listing is published by
 * definition and the optimiser can do its job.
 */

export interface AdminCarRow {
  car: CarListingView;
  /** The listing's cover, or null when nothing has been uploaded yet. */
  cover: CarPhotoView | null;
  photoCount: number;
}

export function CarsList({ rows, today }: { rows: readonly AdminCarRow[]; today: string }) {
  return (
    <ul className="divide-y divide-tm-hairline">
      {rows.map(({ car, cover, photoCount }) => {
        const price = priceLabel(car);
        const mileage = formatMileage(car.mileage, car.mileage_unit);
        const stage = voyageStage(car, today);

        return (
          <li key={car.id}>
            <Link
              href={`/admin/cars/${car.id}`}
              className={cn(
                "group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-tm-paper focus-visible:bg-tm-paper focus-visible:outline-none sm:px-5",
                !car.is_published && "bg-tm-paper/50",
              )}
            >
              <div
                className={cn(
                  "relative flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-tm-tint sm:size-[88px]",
                  !car.is_published && "opacity-80",
                )}
              >
                {cover ? (
                  <img
                    src={cover.url}
                    alt={cover.alt}
                    width={cover.width}
                    height={cover.height}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 px-1 text-center text-tm-text-3">
                    <CameraOffIcon className="size-4" aria-hidden />
                    <span className="text-[10px] leading-none font-bold">No photo</span>
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="min-w-0 truncate text-[14.5px] leading-none font-semibold text-tm-ink">
                    {carTitle(car)}
                  </p>
                  <AdminBadge tone={car.is_published ? "green" : "muted"}>
                    {car.is_published ? "Published" : "Draft"}
                  </AdminBadge>
                  <AdminBadge tone={PRICE_TONE[car.price_state] ?? "neutral"}>
                    {price.text}
                  </AdminBadge>
                </div>

                <p className="min-w-0 truncate text-[12.5px] leading-[1.4] font-medium text-tm-text-3">
                  <span className="tm-nums">/app/cars/{car.slug}</span>
                  {mileage ? <> · <span className="tm-nums">{mileage}</span></> : null}
                  {" · "}
                  {originLabel(car.origin_country)}
                  {photoCount > 0 ? (
                    <>
                      {" · "}
                      <span className="tm-nums">{photoCount}</span>{" "}
                      {photoCount === 1 ? "photo" : "photos"}
                    </>
                  ) : (
                    // Not a cosmetic gap: `setCarPublished` refuses to publish a
                    // listing with an empty gallery.
                    <> · <span className="font-semibold text-tm-coral-strong">
                      Cannot be published without a photo
                    </span></>
                  )}
                </p>

                <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-none font-medium text-tm-text-2">
                  <ShipIcon className="size-3.5 shrink-0 text-tm-text-3" aria-hidden />
                  <span className="min-w-0 truncate">{voyageLine(car, stage)}</span>
                </p>
              </div>

              <ChevronRightIcon
                className="size-4 shrink-0 text-tm-text-3 transition-colors group-hover:text-tm-ink"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A fixed price is a commitment and reads as one; an asking price invites a
 * conversation; "price on request" is not a price at all and must not be styled
 * like one — the same three-way distinction `priceLabel` makes.
 */
const PRICE_TONE: Record<string, AdminTone> = {
  fixed: "neutral",
  negotiable: "amber",
  on_request: "muted",
};

/** Where the car is, in the words the customer's page uses. */
function voyageLine(
  car: Pick<CarListingView, "sailed_on" | "eta_tema" | "vessel_name">,
  stage: CarVoyageStage,
): string {
  const eta = formatEta(car.eta_tema);
  const vessel = car.vessel_name ? ` on the ${car.vessel_name}` : "";

  switch (stage) {
    case "not_sailed":
      return eta ? `Not sailed yet${vessel} · due ${eta}` : `Not sailed yet${vessel}`;
    case "at_sea":
      return eta ? `At sea${vessel} · arriving ${eta}` : `At sea${vessel}`;
    case "arriving":
      return `Arriving ${eta}${vessel}`;
    case "landed":
      return eta ? `Landed at Tema ${eta}` : "Landed at Tema";
    default:
      // Neither date set. Said plainly rather than left blank, because an ETA is
      // the one thing a customer plans around and its absence is worth seeing.
      return "No sailing dates yet";
  }
}
