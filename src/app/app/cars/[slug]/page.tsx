import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";

import {
  CarActionBar,
  CarActions,
  StandingEnquiry,
  CarDepositTerms,
  CarGallery,
  CarLandedCostCard,
  CarPriceBlock,
  CarSpecTable,
  CarTalkCard,
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
import { getCarPurchaseTerms } from "@/features/cars/services/car-orders.service";
import { getMarketingSettings } from "@/features/marketing/services/marketing-content.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { whatsappHref } from "@/components/layout/marketing/links";
import { CAR_PRICE_STATES } from "@/config/constants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
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
  if (!found) return { title: "Car not found" };

  const title = carTitle(found.car);
  const price = priceLabel(found.car);

  return {
    title: `${title}`,
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

  /*
    WHAT THIS VIEWER WOULD PAY, AND WHETHER THEY MAY PAY IT AT ALL.

    THE PRICE STATE IS NOT THE ANSWER. It used to be: the buttons ran off
    `isBuyable(price_state)`, which is false for every `on_request` car, so a
    customer we had already quoted came back to a page that still said "Price on
    request" and offered them nothing but the button they had already pressed.
    An agreed figure is that customer's price. `getCarPurchaseTerms` is what
    reads the quote and the accepted offer, and it takes the viewer's id because
    the answer is different for every viewer and PRIVATE to the one it belongs
    to.

    NULL IS A REAL ANSWER AND IT MEANS "DRAW NOTHING PAYABLE". Not "fall back to
    the listing price": the listing price is what a quote replaces, and charging
    a deposit against it would be charging the wrong number. Signed out it is
    null too, and the ask and offer buttons still send the visitor to sign in.
  */
  const terms = await getCarPurchaseTerms(car.id, viewer?.id ?? null);

  /*
    THE WHATSAPP NUMBER, RESOLVED ONCE, SERVER-SIDE, THROUGH THE EXISTING PATH.
    `getMarketingSettings()` reads `site_settings` and `whatsappHref()` turns
    `0XXXXXXXXX` into `233XXXXXXXXX` — the same two calls `AskBuyerCard` is
    built on, deliberately reused. A client component fetching settings for
    itself would be a second implementation of the same rule and a network
    round trip on a page that is already server-rendered.

    A FAILED SETTINGS READ COSTS THE HANDOFF, NOT THE CAR. `getMarketingSettings`
    rethrows when the relation is missing, and this segment defines no
    `error.tsx`, so an uncaught throw would replace the whole application shell
    over a phone number. Caught here, the card falls back to `/contact`.
  */
  const settings = await getMarketingSettings().catch((error: unknown) => {
    logger.warn("car detail: site settings unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { whatsappNumber: null, supportHours: null };
  });
  const carUrl = `${env.app.url}/app/cars/${car.slug}`;

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
            {/*
              The note is dropped for a customer we have already quoted. The
              headline still reads "Price on request", because that is the
              listing's public state and it has not changed, but the sentence
              under it says "Ask us and we will come back with a landed figure"
              and they did, and we came back, and the figure is on this screen.
            */}
            <CarPriceBlock
              listing={car}
              size="hero"
              showNote={!(terms?.buyable && car.price_state === CAR_PRICE_STATES.ON_REQUEST)}
              className="pt-1"
            />

            {/*
              THE THREE NUMBERS, IN THE DOCUMENT, BEFORE ANY BUTTON. A car is
              GH₵120,000 to GH₵260,000 and no MoMo wallet moves that in one
              transaction, so Paystack takes a deposit and the balance is
              settled by bank transfer or in person. The customer reads what the
              car costs, what is about to leave their wallet and what is still
              owed, here, next to the price. `lg:hidden` because the desktop
              aside carries its own copy beside the buttons: one panel at any
              given width, like the action row itself.
            */}
            {terms && (
              <CarDepositTerms terms={terms} className="mt-1 lg:hidden" />
            )}

            {/*
              OUR REPLY, ON A PHONE. `lg:hidden` for the same reason the panel
              above is: the desktop aside carries its own copy beside the
              buttons. It has to be here rather than in the sticky bar, because
              the bar suppresses it (`barOnly`) — a bar that overlays the page
              is for the one thing there is to press, not for reading. Without
              this the answer an admin wrote would be invisible below `lg`,
              which is most of the people who will read it.
            */}
            {standingEnquiry && (
              <StandingEnquiry enquiry={standingEnquiry} className="mt-1 lg:hidden" />
            )}
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
            {/*
              The terms REPLACE the price block rather than joining it. The
              headline price is already in the content column at this width, and
              on a quoted `on_request` car the words "Price on request" printed
              directly above the figure we quoted reads as a contradiction
              rather than as context.
            */}
            {terms ? (
              <CarDepositTerms terms={terms} />
            ) : (
              <CarPriceBlock listing={car} />
            )}
            <CarActions
              standingEnquiry={standingEnquiry}
              terms={terms}
              carListingId={car.id}
              slug={car.slug}
              title={title}
              priceState={car.price_state}
              pricePesewas={car.price_pesewas}
            />
          </div>

          <CarLandedCostCard car={car} />

          {/*
            The way out to a person, under the money and not beside it. A buyer
            moving GH₵200,000 wants to talk to somebody, and they want it while
            they are looking at the vehicle. It is an outline card rather than a
            second coral button for the same reason the offer button stands down
            next to a deposit: two primary calls to action mean neither is one.
          */}
          <CarTalkCard
            whatsappHref={whatsappHref(settings.whatsappNumber)}
            supportHours={settings.supportHours}
            title={title}
            carUrl={carUrl}
          />
        </aside>
      </div>

      <CarActionBar car={car} standingEnquiry={standingEnquiry} terms={terms} />
    </div>
  );
}
