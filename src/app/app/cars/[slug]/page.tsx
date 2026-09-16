import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

import {
  CarActionBar,
  CarActions,
  CarGallery,
  CarLandedCostCard,
  CarPriceBlock,
  CarSpecTable,
  RIBBON_TONE_CLASS,
  accraDay,
  fuelLabel,
  shortTransmissionLabel,
  voyageRibbon,
} from "@/features/cars/components";
import {
  carTitle,
  formatMileage,
  formatPesewas,
  originLabel,
  priceLabel,
} from "@/features/cars/format";
import {
  getLiveCarEnquiryForViewer,
  getPublishedCarBySlug,
} from "@/features/cars/services/cars.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { cn } from "@/lib/utils";

interface CarPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The page's own title and description, built from the listing.
 *
 * It calls the same read the page does. Next dedupes the two within one request
 * (React `cache` around the fetch layer), and the alternative — threading the
 * listing out of `generateMetadata` into the component — is not something the
 * App Router offers.
 *
 * THE DESCRIPTION NEVER PRINTS A FIGURE FOR AN `on_request` CAR. `priceLabel`
 * is total over the three price states, so the same rule that governs the
 * visible price governs the link preview: a share card that says
 * "GH₵185,000" for a vehicle whose page says "Price on request" is the
 * feature's worst failure, and it would happen in exactly the place nobody
 * looks.
 */
export async function generateMetadata({ params }: CarPageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublishedCarBySlug(slug);
  if (!found) return { title: "Car not found · Tomame" };

  const title = carTitle(found.car);
  const price = priceLabel(found.car);

  return {
    title: `${title} · Tomame`,
    description: `${title}: ${price.text}${
      price.isAmount ? ", landed in Tema with duty and clearing paid" : ""
    }.`,
  };
}

/**
 * One car.
 *
 * PUBLIC, like the index. `/app/cars` is prefix-matched in `publicRoutes`
 * (`src/lib/supabase/proxy.ts`), so this page is the link a buyer sends to
 * somebody who has never signed in. `getPublishedCarBySlug` leaves
 * `publishedOnly` at the query's default, so an unpublished draft 404s here
 * rather than being rendered for anyone holding the URL — and the photo route
 * makes the same check per request, so an unpublish takes the page and the
 * pictures down together.
 *
 * THE PHONE GETS A STICKY BAR AND THE DESKTOP GETS A RAIL, and they are the
 * same two controls rather than two implementations: `CarActions` is rendered
 * once in the aside (`hidden lg:flex`) and once inside `CarActionBar`
 * (`lg:hidden`), so at any single width exactly one copy exists and a keyboard
 * meets each button once.
 *
 * WHAT IS NOT ON THIS PAGE: any arithmetic. The landed-cost card prints the
 * four stored components and refuses to draw at all unless every one of them is
 * present; nothing subtracts the parts we have from the total to invent the
 * ones we do not. `src/features/cars/format.ts` divides pesewas by a hundred
 * and that is the only sum anywhere in the feature's UI.
 *
 * A Server Component. The gallery and the two action rows are the client
 * islands.
 */
export default async function CarDetailPage({ params }: CarPageProps) {
  const { slug } = await params;
  const found = await getPublishedCarBySlug(slug);
  if (!found) notFound();

  const { car, photos } = found;
  const title = carTitle(car);
  /*
    HAS THIS VIEWER ALREADY ASKED ABOUT THIS CAR? The page used to draw "Ask for
    the price" unconditionally, so a customer who had asked yesterday pressed it
    again today and got a 409 from the unique index — an error where the honest
    answer was "we have your question". Read here rather than in the client so
    the first paint is already right; signed out it costs nothing (the helper
    returns null without a query).
  */
  const viewer = await getAuthenticatedUser();
  const liveEnquiry = await getLiveCarEnquiryForViewer(car.id, viewer?.id ?? null);
  const standingEnquiry =
    liveEnquiry && (liveEnquiry.status === "open" || liveEnquiry.status === "answered")
      ? {
          status: liveEnquiry.status,
          kind: liveEnquiry.kind,
          adminResponse: liveEnquiry.admin_response,
          // Formatted here, in the server component: `CarActions` does no
          // arithmetic on money and must not start now.
          quotedLabel:
            liveEnquiry.quoted_pesewas != null
              ? formatPesewas(liveEnquiry.quoted_pesewas)
              : null,
        }
      : null;

  const today = accraDay(new Date());
  const ribbon = voyageRibbon(car, today);

  // The strip under the name: the four things somebody checks before they look
  // at anything else. Each is omitted rather than defaulted — "0 mi" on a car
  // whose odometer nobody has read is a claim, and a flattering one.
  const specs = [
    formatMileage(car.mileage, car.mileage_unit),
    fuelLabel(car.fuel),
    shortTransmissionLabel(car.transmission),
    `From ${originLabel(car.origin_country)}`,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Link
        href="/app/cars"
        className="tm-up inline-flex w-fit items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-text-2 transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <ArrowLeft weight="bold" className="size-3.5" aria-hidden />
        All cars
      </Link>

      <div
        className={cn(
          // `minmax(0,1fr)` floors on both tracks. A bare `1fr` is sized to its
          // widest child's min-content, and a 17-character VIN or a long
          // vessel name in one is what pushes a page past the viewport.
          "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6",
          "lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start lg:gap-8",
        )}
      >
        <div className="tm-up flex min-w-0 flex-col gap-6">
          <CarGallery photos={photos} title={title} />

          <header className="flex min-w-0 flex-col gap-3">
            {ribbon && (
              <span
                className={cn(
                  "w-fit max-w-full truncate rounded-full px-3 py-1.5 text-[12px] leading-none font-bold",
                  RIBBON_TONE_CLASS[ribbon.tone],
                )}
              >
                {ribbon.text}
              </span>
            )}

            <h1 className="min-w-0 font-display text-[28px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[36px]">
              {title}
            </h1>

            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[1.35] font-semibold text-tm-text-3">
              {specs.map((spec, index) => (
                <span key={spec} className="flex min-w-0 items-center gap-2">
                  {index > 0 && <span aria-hidden>·</span>}
                  {spec}
                </span>
              ))}
            </p>

            {/*
              The price lives in the CONTENT at every width, not only in the
              phone bar. A sticky bar is the thumb-reach copy of an action; it
              is not where the one number this page exists to state should first
              appear in the document.
            */}
            <CarPriceBlock listing={car} size="hero" className="pt-1" />
          </header>

          {car.description.trim().length > 0 && (
            <section aria-labelledby="car-description-heading" className="flex min-w-0 flex-col gap-2">
              <h2
                id="car-description-heading"
                className="font-display text-[17px] leading-none font-bold"
              >
                About this car
              </h2>
              {/*
                `whitespace-pre-line`: the admin types paragraphs into a
                textarea and the line breaks they chose are the only structure
                the column stores. It is plain text rendered as text — never
                `dangerouslySetInnerHTML`, even though the author is an admin.
              */}
              <p className="max-w-[68ch] text-[14.5px] leading-[1.6] font-medium whitespace-pre-line text-tm-text-2">
                {car.description}
              </p>
            </section>
          )}

          <section aria-labelledby="car-specs-heading" className="flex min-w-0 flex-col gap-2">
            <h2
              id="car-specs-heading"
              className="font-display text-[17px] leading-none font-bold"
            >
              Specification
            </h2>
            <CarSpecTable car={car} />
          </section>
        </div>

        <aside className="tm-up flex min-w-0 flex-col gap-4 [animation-delay:0.06s] lg:sticky lg:top-6">
          {/*
            The desktop action card. Hidden below `lg`, where `CarActionBar`
            takes over — one copy of the controls at any given width, so a
            keyboard meets "Buy now" once and a screen reader announces it once.
          */}
          <div className="hidden min-w-0 flex-col gap-3.5 rounded-[20px] border border-tm-border bg-card p-5 lg:flex">
            <CarPriceBlock listing={car} />
            <CarActions
              standingEnquiry={standingEnquiry}
              carListingId={car.id}
              slug={car.slug}
              title={title}
              priceState={car.price_state}
              pricePesewas={car.price_pesewas}
            />
          </div>

          <CarLandedCostCard car={car} />
        </aside>
      </div>

      <CarActionBar car={car} standingEnquiry={standingEnquiry} />
    </div>
  );
}
