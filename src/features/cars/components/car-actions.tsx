"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChatCircleDots, SpinnerGap, Tag } from "@phosphor-icons/react/ssr";

import { CAR_PRICE_STATES, type CarPriceState } from "@/config/constants";
import { ApiFetchError, apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import { enquiryKindFor } from "../format";
import { CarEnquiryDialog } from "./car-enquiry-dialog";
import { isBuyable } from "./labels";

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

/** The card's row is shorter and quieter: it sits under a photograph, not under a hero. */
const COMPACT = "h-[42px] rounded-[12px] text-[13.5px]";

export interface CarActionsProps {
  carListingId: string;
  /** Used to build the sign-in return address, so a signed-out visitor lands back on THIS car. */
  slug: string;
  /** "2019 Toyota Highlander XLE" — the dialog says it back. */
  title: string;
  priceState: CarPriceState;
  /** PESEWAS. Shown by the dialog as context; never used to compute anything. */
  pricePesewas: number | null;
  /** `compact` is the index card's action row; `full` is the detail page and the phone bar. */
  size?: "compact" | "full";
  className?: string;
}

/**
 * The buttons under a car: buy it, or start a conversation about it.
 *
 * THE THREE PRICE STATES ARE THE WHOLE COMPONENT, and each draws a different
 * row because each means a different thing:
 *
 *   * `fixed` — a number the customer can act on. One button: Buy now.
 *   * `negotiable` — an asking price that invites an offer. Both buttons, with
 *     Buy now still primary, because a customer who is happy with the asking
 *     price should not have to negotiate to pay it.
 *   * `on_request` — no number exists. `car_listings_price_state_has_price`
 *     makes "on request but priced" unrepresentable, so there is nothing for a
 *     Buy now to charge and it is NOT DRAWN rather than drawn and refused.
 *
 * NOTHING HERE DECIDES ANYTHING FOR REAL. `/api/cars/checkout` answers 409 when
 * a listing is not purchasable and `createCarEnquiry` refuses an offer on a
 * fixed-price car; this only decides what to paint. That split is deliberate —
 * the listing's price state can move between the render and the tap.
 *
 * A FULL NAVIGATION TO PAYSTACK, not a router push: `window.location.assign`,
 * the same move `useBagPayment` makes, because Paystack owns the next screen
 * and a client-side transition into an external origin is not a thing React
 * Router can do.
 *
 * `busy` is deliberately never cleared on the success path. The browser is
 * leaving; resetting the button would flash "Buy now" for a frame on a page
 * that is already navigating away.
 */
export function CarActions({
  carListingId,
  slug,
  title,
  priceState,
  pricePesewas,
  size = "full",
  className,
}: CarActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const returnTo = `/app/cars/${slug}`;
  const enquiryKind = enquiryKindFor(priceState);
  const compact = size === "compact";

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
    <>
      <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
        {isBuyable(priceState) && (
          <button
            type="button"
            onClick={buy}
            disabled={busy}
            aria-busy={busy}
            className={cn(PRIMARY, compact && COMPACT)}
          >
            {busy ? (
              <SpinnerGap
                className={cn("shrink-0 animate-spin", compact ? "size-3.5" : "size-4")}
                aria-hidden
              />
            ) : null}
            <span className="truncate">
              {busy ? "Taking you to Paystack…" : "Buy now"}
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

        {enquiryKind && (
          <button
            type="button"
            onClick={() => setEnquiryOpen(true)}
            className={cn(
              // On an on-request car this IS the only action, so it takes the
              // primary skin. Beside a Buy now it stands down to the outline.
              priceState === CAR_PRICE_STATES.ON_REQUEST ? PRIMARY : SECONDARY,
              compact && COMPACT,
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
              {priceState === CAR_PRICE_STATES.ON_REQUEST
                ? "Ask for the price"
                : "Make an offer"}
            </span>
          </button>
        )}
      </div>

      {/*
        Mounted only once a customer has asked for it. The dialog holds form
        state and a fetch; a grid of twelve cards would otherwise carry twelve
        of them, all closed, all hydrated.
      */}
      {enquiryKind && enquiryOpen && (
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
    </>
  );
}
