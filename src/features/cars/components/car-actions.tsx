"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChatCircleDots,
  Clock,
  SpinnerGap,
  Tag,
} from "@phosphor-icons/react/ssr";

import { CAR_PRICE_STATES, type CarPriceState } from "@/config/constants";
import { ApiFetchError, apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import { enquiryKindFor } from "../format";
import { CarEnquiryDialog } from "./car-enquiry-dialog";
import { isBuyable } from "./labels";
import { depositButtonLabel, type CarPurchaseTermsView } from "./purchase";

/**
 * What `POST /api/cars/checkout` answers with.
 *
 * NOT DEFINED BY THIS FILE — it is the contract of a route another part of the
 * feature owns, mirrored here so that a change to its shape fails typecheck at
 * the call site rather than producing `window.location.assign(undefined)`.
 * `reference` is unused by this component and is kept because it is part of the
 * answer, and a mirror that quietly drops half the payload stops being a mirror.
 */
interface CarCheckoutStart {
  authorizationUrl: string;
  reference: string;
}

const PRIMARY = cn(
  "tm-cta-gradient flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] px-4 text-[15px] leading-none font-bold text-white",
  "transition-[filter,opacity] hover:brightness-105",
  "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

const SECONDARY = cn(
  "flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card px-4 text-[15px] leading-none font-bold text-tm-ink",
  "transition-colors hover:border-tm-coral/40 hover:bg-tm-tint",
  "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/**
 * The card's row is shorter and quieter: it sits under a photograph, not under
 * a hero.
 *
 * THE MINIMUM WIDTH IS WHAT MAKES TWO ACTIONS WRAP INSTEAD OF TRUNCATE. A tile
 * carries as much as "See the deposit" beside "Make an offer", and the narrowest
 * tile in the product is the Home rail's 296px, which leaves 264px of row: two
 * of these cannot sit side by side in it. With `flex-wrap` on the row and a
 * floor of 164px each they drop onto two lines there and stay on one in the
 * grid, at 390px and at 1280px alike, with no breakpoint to keep in step with a
 * tile width defined in another file. Before this, both labels truncated on the
 * rail and the card offered two buttons neither of which could be read.
 */
const COMPACT = "h-[42px] min-w-[164px] rounded-[12px] text-[13.5px]";

/**
 * The ask button once there is already a live enquiry on this car.
 *
 * A WHOLE CLASS STRING, NOT AN OVERRIDE ON TOP OF `PRIMARY`. The primary skin
 * gets its colour from `tm-cta-gradient`, a custom utility that sets the
 * `background` SHORTHAND; layering `bg-none` over it depends on which rule the
 * generated stylesheet happens to emit last, and it lost — the button read
 * `disabled` to a screen reader while still glowing coral, which is the one
 * combination worse than either state alone. Swapping the base class leaves
 * nothing to win a cascade fight over.
 */
const ASKED = cn(
  "flex h-[52px] min-w-0 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-[14px]",
  "border-[1.5px] border-tm-border bg-tm-pill-bg px-4 text-[15px] leading-none font-bold text-tm-text-3",
);

/** Just enough of a live enquiry for the button row to say what is going on. */
export interface StandingCarEnquiry {
  status: "open" | "answered";
  kind: "price_request" | "offer";
  /** The admin's reply, shown verbatim once answered. */
  adminResponse: string | null;
  /** Already formatted — this component does no arithmetic on money. */
  quotedLabel: string | null;
}

export interface CarActionsProps {
  carListingId: string;
  /** Used to build the sign-in return address, so a signed-out visitor lands back on THIS car. */
  slug: string;
  /** "2019 Toyota Highlander XLE" — the dialog says it back. */
  title: string;
  priceState: CarPriceState;
  /** PESEWAS. Shown by the dialog as context; never used to compute anything. */
  pricePesewas: number | null;
  /**
   * The viewer's own enquiry on this car, when one is live (open or answered).
   *
   * Null for a signed-out visitor and for anyone who has not asked. When it is
   * set, the ask button is replaced rather than accompanied: the database
   * refuses a second live enquiry on the same car from the same customer, so
   * the only thing a second press could produce is an error.
   */
  standingEnquiry?: StandingCarEnquiry | null;
  /**
   * True in the phone's sticky bar, where space is a budget rather than a
   * layout.
   *
   * WHY IT EXISTS. The bar overlays the page for as long as it is pinned, so
   * every pixel it takes is a pixel of the car nobody can see. On a quoted car
   * it had grown to 264px of an 844px screen — 31% of the viewport — because it
   * was carrying the whole standing-enquiry panel and a GREYED button, neither
   * of which is an action. Both still appear in the page body, which is where
   * somebody reading rather than pressing will look for them. The bar keeps the
   * price context and the one thing there is to press.
   */
  barOnly?: boolean;
  /**
   * WHAT THIS VIEWER WOULD PAY, struck server-side by `getCarPurchaseTerms`.
   *
   * THE ONLY THING THAT DECIDES WHETHER A PAYMENT BUTTON IS DRAWN. Null means
   * the server could not price this car for this viewer, and the answer to
   * that is NO PAYABLE AFFORDANCE AT ALL rather than a button over a guessed
   * figure. It is optional because a grid card does not resolve terms per
   * tile: those pass `buyHref` instead and send the customer to the car, where
   * the numbers are.
   */
  terms?: CarPurchaseTermsView | null;
  /**
   * Where to send somebody instead of charging them, for rows that cannot know
   * the price. Set by the cards; unset on the detail page, which has terms.
   */
  buyHref?: string | null;
  /** `compact` is the index card's action row; `full` is the detail page and the phone bar. */
  size?: "compact" | "full";
  className?: string;
}

/**
 * The buttons under a car: pay for it, or start a conversation about it.
 *
 * THE PAYMENT BUTTON IS DRIVEN BY THE TERMS, NOT BY THE PRICE STATE. It used
 * to be `isBuyable(priceState)`, which is false for every `on_request` car, and
 * that was a bug about money rather than about layout: once an admin answers a
 * price request with a quote, THAT figure is what this customer pays, and the
 * page went on showing them a button they could not press and a price they had
 * already been given. `getCarPurchaseTerms` is the thing that knows, because it
 * is the thing that reads the quote and the accepted offer, and it answers for
 * one viewer at a time because an agreed figure is private to the person it was
 * agreed with. Null from it means NO PAYABLE AFFORDANCE, never a fallback to
 * the listing price.
 *
 * `isBuyable` survives in this file for exactly one job: deciding whether a
 * CARD, which resolves no terms, should offer a link into the car at all. That
 * link charges nobody, so being wrong about it costs a wasted tap rather than a
 * surprise on Paystack.
 *
 * THE BUTTON NAMES THE SUM. "Pay GH₵54,000 deposit", never "Buy now". A car is
 * six figures, a MoMo wallet cannot carry that in one transaction, and Paystack
 * therefore takes a deposit while the balance is settled by bank transfer or in
 * person. A button saying "Buy now" that charges thirty per cent would be a lie
 * about money, discovered on somebody else's screen. `CarDepositTerms` prints
 * all three figures above this row; the label repeats the one being charged.
 *
 * THE ENQUIRY BUTTON IS UNCHANGED and still follows the price state, because
 * which conversation a car invites is a property of the listing and not of the
 * viewer: `on_request` asks for a price, `negotiable` makes an offer, `fixed`
 * has nothing to ask.
 *
 * NOTHING HERE DECIDES ANYTHING FOR REAL. `/api/cars/checkout` answers 409 when
 * a listing is not purchasable and `createCarEnquiry` refuses an offer on a
 * fixed-price car; this only decides what to paint. That split is deliberate:
 * the listing can be sold between the render and the tap.
 *
 * A FULL NAVIGATION TO PAYSTACK, not a router push: `window.location.assign`,
 * the same move `useBagPayment` makes, because Paystack owns the next screen
 * and a client-side transition into an external origin is not a thing React
 * Router can do.
 *
 * `busy` is deliberately never cleared on the success path. The browser is
 * leaving; resetting the button would flash the deposit label for a frame on a
 * page that is already navigating away.
 */
export function CarActions({
  carListingId,
  slug,
  title,
  priceState,
  pricePesewas,
  standingEnquiry = null,
  barOnly = false,
  terms = null,
  buyHref = null,
  size = "full",
  className,
}: CarActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const returnTo = `/app/cars/${slug}`;
  /*
    A LIVE ENQUIRY REPLACES THE BUTTON; IT DOES NOT SIT BESIDE IT. The database
    already refuses a second open or answered enquiry on the same car from the
    same customer, so leaving the button live meant the only thing a second tap
    could produce was a 409 dressed as an error. Kelvin: "they can consistently
    send it again, and again which is not the ideal solution." Once it is
    declined, accepted or withdrawn the row stops being live, the button comes
    back, and the customer may ask again — which is what 067 intended.
  */
  const enquiryKind = enquiryKindFor(priceState);
  // Live enquiry: the button stays, greyed. Kelvin: "If an enquiry exist, grey
  // the button." Removing it outright made the row look like a different car
  // from the one the customer was looking at yesterday; greying says "yes, this
  // is the thing you pressed, and you have already pressed it".
  const asked = standingEnquiry != null;
  const compact = size === "compact";

  /*
    THE ONE GATE ON CHARGING ANYBODY. Both halves matter: terms that came back
    null mean the server could not price this car for this viewer, and
    `buyable: false` means it priced it and says no (sold, unpublished, a quote
    that has since been withdrawn). Neither draws a payment button.
  */
  const payableTerms = terms != null && terms.buyable ? terms : null;
  const payable = payableTerms != null;
  /*
    A card cannot know this viewer's private figure and must not print a public
    one as though it were theirs, so it links into the car instead of charging.
    An answered enquiry earns the link too: a customer we have quoted has a
    price waiting on the detail page even though the tile still reads "Price on
    request".
  */
  const linkToCar =
    !payable &&
    buyHref != null &&
    (isBuyable(priceState) || standingEnquiry?.quotedLabel != null);
  /*
    Two full-width buttons side by side at 390px leave each about 110px, and
    "Pay GH₵54,000 deposit" does not fit in 110px. When both a payment and an
    enquiry are on offer the row becomes a column, which is also the only shape
    that works in the ~300px desktop aside card.
  */
  const stack = !compact && payable && enquiryKind != null;
  /** `flex-none` beats `flex-1` through tailwind-merge; `flex-1` in a column would size the height. */
  const fill = stack ? "w-full flex-none" : null;

  const toLogin = useCallback(() => {
    router.push(`/auth/login?next=${encodeURIComponent(returnTo)}`);
  }, [returnTo, router]);

  const buy = useCallback(async () => {
    setBusy(true);
    try {
      const response = await apiFetch<ApiSuccessResponse<CarCheckoutStart>>(
        "/api/cars/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The id and nothing else. The price is read from the row
          // server-side — CLAUDE.md: never trust a client-provided total.
          body: JSON.stringify({ carListingId }),
        },
      );
      window.location.assign(response.data.authorizationUrl);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiFetchError && error.status === 401) {
        toLogin();
        return;
      }
      toast.error({
        title: "Could not start the payment",
        description:
          error instanceof Error && error.message
            ? error.message
            : "Try again in a moment.",
      });
    }
  }, [carListingId, toLogin]);

  return (
    /*
      A COLUMN, not a fragment. The greyed button and the reply beneath it are
      one control now, and both the phone bar and the desktop rail drop this
      into a flex ROW beside the price — two loose siblings would have put the
      reply next to the buttons rather than under them.
    */
    <div className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <div
        className={cn(
          "flex min-w-0 gap-2.5",
          stack ? "flex-col" : "items-center",
          // Tiles wrap; the hero and the phone bar do not, because `stack`
          // has already decided the shape there and a wrap would fight it.
          compact && "flex-wrap",
        )}
      >
        {payableTerms && (
          <button
            type="button"
            onClick={buy}
            disabled={busy}
            aria-busy={busy}
            className={cn(PRIMARY, compact && COMPACT, fill)}
          >
            {busy ? (
              <SpinnerGap
                className={cn("shrink-0 animate-spin", compact ? "size-3.5" : "size-4")}
                aria-hidden
              />
            ) : null}
            <span className="truncate">
              {busy ? "Taking you to Paystack…" : depositButtonLabel(payableTerms)}
            </span>
            {!busy && (
              <ArrowRight
                weight="bold"
                className={cn("shrink-0", compact ? "size-3.5" : "size-4")}
                aria-hidden
              />
            )}
          </button>
        )}

        {linkToCar && buyHref && (
          /*
            A LINK, NOT A BUTTON, AND IT SAYS SO. It navigates to the car and
            charges nothing, which is the whole reason it is allowed to exist on
            a tile that cannot know what this customer would pay. The deposit,
            the balance and the full price are all stated on the page it opens,
            so nobody reaches Paystack from a grid without having read them.
          */
          <Link
            href={buyHref}
            className={cn(PRIMARY, compact && COMPACT, fill)}
          >
            {/*
              SHORTER ON A TILE, AND MEASURED RATHER THAN GUESSED. Three cards
              across 1280px give each action about 173px, and "See price and
              deposit" beside "Make an offer" truncates to "See price and de…" —
              which is the failure `CarGrid` already caps the column count to
              avoid. The card carries the asking price a few pixels above, so
              the deposit is the only figure left to promise.
            */}
            <span className="truncate">
              {compact ? "See the deposit" : "See price and deposit"}
            </span>
            <ArrowRight
              weight="bold"
              className={cn("shrink-0", compact ? "size-3.5" : "size-4")}
              aria-hidden
            />
          </Link>
        )}

        {enquiryKind && !(barOnly && asked) && (
          <button
            type="button"
            onClick={() => setEnquiryOpen(true)}
            disabled={asked}
            aria-disabled={asked || undefined}
            className={cn(
              // Asked already: greyed, and not merely a faded gradient.
              // Otherwise the skin follows whether anything else is competing:
              // alone on the row this IS the action and takes the gradient;
              // beside a deposit button or a link into the car it stands down
              // to the outline, because two coral calls to action mean neither
              // is the call to action.
              asked ? ASKED : payable || linkToCar ? SECONDARY : PRIMARY,
              compact && COMPACT,
              fill,
            )}
          >
            {priceState === CAR_PRICE_STATES.ON_REQUEST ? (
              <ChatCircleDots
                weight="duotone"
                className={cn("shrink-0", compact ? "size-3.5" : "size-4")}
                aria-hidden
              />
            ) : (
              <Tag
                weight="duotone"
                className={cn("shrink-0", compact ? "size-3.5" : "size-4")}
                aria-hidden
              />
            )}
            <span className="truncate">
              {asked
                ? standingEnquiry?.status === "answered"
                  ? "We have replied"
                  : "Already asked"
                : priceState === CAR_PRICE_STATES.ON_REQUEST
                  ? "Ask for the price"
                  : "Make an offer"}
            </span>
          </button>
        )}
      </div>

      {standingEnquiry && !barOnly && (
        <StandingEnquiry enquiry={standingEnquiry} compact={compact} />
      )}

      {/*
        Mounted only once a customer has asked for it. The dialog holds form
        state and a fetch; a grid of twelve cards would otherwise carry twelve
        of them, all closed, all hydrated.
      */}
      {enquiryKind && !asked && enquiryOpen && (
        <CarEnquiryDialog
          open={enquiryOpen}
          onOpenChange={setEnquiryOpen}
          carListingId={carListingId}
          title={title}
          kind={enquiryKind}
          askingPesewas={pricePesewas}
          returnTo={returnTo}
        />
      )}
    </div>
  );
}

/**
 * What a customer sees once they have already asked about this car.
 *
 * It says which of the two things is true and nothing more: we have your
 * question and have not answered it, or we have answered and here is the
 * answer. It is deliberately not a button — there is nothing useful to press,
 * because the one action it could offer is the one the database refuses.
 *
 * An ANSWERED enquiry prints the admin's own words. That is the reply the
 * customer was never shown: it lives on the row, the bell now links here, and
 * this is where it is read.
 */
export function StandingEnquiry({
  enquiry,
  compact = false,
  className,
}: {
  enquiry: StandingCarEnquiry;
  compact?: boolean;
  className?: string;
}) {
  const answered = enquiry.status === "answered";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-[14px] border px-3.5 py-2.5",
        className,
        answered
          ? "border-tm-green/25 bg-tm-green-bg"
          : "border-tm-border bg-tm-pill-bg",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 leading-none font-bold",
          compact ? "text-[12px]" : "text-[13px]",
          answered ? "text-tm-green-ink" : "text-tm-text-2",
        )}
      >
        {answered ? (
          <ChatCircleDots weight="fill" className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <Clock weight="duotone" className="size-3.5 shrink-0" aria-hidden />
        )}
        {answered
          ? enquiry.quotedLabel
            ? `We quoted ${enquiry.quotedLabel}`
            : "We have replied"
          : enquiry.kind === "offer"
            ? "Your offer is with us"
            : "You asked us for the price"}
      </span>

      {answered && enquiry.adminResponse ? (
        <span className="text-[11.5px] leading-[1.4] font-medium text-tm-text-2">
          {enquiry.adminResponse}
        </span>
      ) : (
        !answered && (
          <span className="text-[11.5px] leading-[1.4] font-medium text-tm-text-3">
            We will come back to you. You do not need to ask again.
          </span>
        )
      )}
    </div>
  );
}
