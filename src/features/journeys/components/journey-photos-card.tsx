import { Camera } from "@phosphor-icons/react/ssr";

import type { OrderPhotoView } from "@/features/order-photos/types";
import { formatEventStamp, photoAltText, photoKindLabel } from "../format";
import { JourneyFeedback } from "./journey-feedback";

export interface JourneyPhotosCardProps {
  orderId: string;
  /** Customer-visible photographs of this parcel, newest first. Empty is normal. */
  photos: OrderPhotoView[];
}

/**
 * "Your parcel, photographed" (054) — the first sight the customer gets of what
 * was actually BOUGHT rather than what they asked for.
 *
 * It sits directly under the track and above Updates on purpose: this is the
 * news. Burying it beneath the receipt would mean the one screen element that
 * can still change the outcome is the one nobody scrolls to.
 *
 * NOTHING IS INVENTED WHEN THERE IS NO PHOTO. No placeholder parcel, no grey
 * box pretending to be a picture — one honest sentence saying what will appear
 * and when. `photos` is empty for every order that has not reached a hub yet,
 * which is most of them at any moment.
 *
 * `<img>` rather than `next/image`: the bytes come from
 * `/api/order-photos/<id>`, a private route that re-checks ownership on every
 * request and answers `Cache-Control: private, no-store`. The optimiser has
 * nothing to cache and no way to fetch it as the signed-in viewer. The width and
 * height the server re-encoded to are set as attributes, so the box is reserved
 * before a byte arrives and nothing below it jumps.
 */
export function JourneyPhotosCard({ orderId, photos }: JourneyPhotosCardProps) {
  const hasPhotos = photos.length > 0;

  return (
    <section className="tm-up flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.06s] [animation-duration:0.5s]">
      <div className="flex flex-wrap items-center gap-2">
        <Camera weight="duotone" className="size-5 shrink-0 text-tm-coral" aria-hidden />
        <h2 className="font-display min-w-0 text-lg leading-none font-bold">
          Your parcel, photographed
        </h2>
      </div>

      {hasPhotos ? (
        <ul
          className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 ${
            photos.length > 1 ? "sm:grid-cols-2" : ""
          }`}
        >
          {photos.map((photo, index) => (
            <li key={photo.id} className="min-w-0">
              <figure className="flex min-w-0 flex-col gap-2">
                {/*
                  The newest photo loads EAGERLY. It is the reason this screen
                  exists — the customer opened it to look at that picture, and it
                  sits above the fold — so deferring it defers the content. Lazy
                  is for imagery a reader may never scroll to, which the second
                  and later photos are. It is also a hedge: lazy loading depends
                  on the page being visible, and that could not be verified in
                  this environment, so the one image that must appear does not
                  rely on it.
                */}
                <img
                  src={photo.url}
                  alt={photoAltText(photo.kind, photo.takenAt)}
                  width={photo.width}
                  height={photo.height}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  decoding="async"
                  className="h-auto max-h-[420px] w-full max-w-full min-w-0 rounded-2xl bg-tm-tint object-contain"
                />
                <figcaption className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs leading-none font-medium text-tm-text-3">
                    {[photoKindLabel(photo.kind), formatEventStamp(photo.takenAt)]
                      .filter((part): part is string => !!part)
                      .join(" · ")}
                  </span>
                  {/*
                    The operator's own words, quoted, next to the picture they
                    were written about — not restyled into a system message.
                  */}
                  {photo.caption && (
                    <span className="min-w-0 rounded-xl bg-tm-tint px-3.5 py-2.5 text-[13px] leading-[1.5] break-words text-tm-text-2">
                      &ldquo;{photo.caption}&rdquo;
                    </span>
                  )}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-[1.5] text-tm-text-2">
          No photo yet. When your parcel reaches our US hub we photograph it, and the
          picture appears here, so you can check we bought the right thing while it is
          still cheap to put right.
        </p>
      )}

      <JourneyFeedback orderId={orderId} photos={photos} ask={hasPhotos} />
    </section>
  );
}
