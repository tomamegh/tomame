import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Check } from "@phosphor-icons/react/ssr";

import { readQuoteSessionFromCookies } from "@/lib/quote-session";

import { SUPPORTED_STORE_NAMES } from "@/features/extraction/scrapers";
import { getHomeView } from "@/features/app-home/services/home.service";
import {
  AskBuyerCard,
  DealsShelf,
  EntryDoors,
  FreightBoxCard,
  GreetingChip,
  HeroPasteBar,
  JourneysInMotion,
  LiveReceiptCard,
} from "@/features/app-home/components";
import { CarsRail, accraDay } from "@/features/cars/components";
import { PriceWatchCard } from "@/features/watches/components";

/**
 * Trust chips under the paste bar.
 *
 * The third, "Rate locked Nh", is backed by `quote_locks`: N is
 * `pricing_constants.rate_lock_hours`, the same number the lock is minted with.
 * It is omitted when the constant cannot be read rather than shown with a
 * hardcoded 24 — an unbacked promise is worse than a missing chip.
 */
function trustChips(rateLockHours: number | null): string[] {
  const chips = ["Price in GH₵ before you pay", "Refund if we can't source"];
  if (rateLockHours != null && rateLockHours > 0) chips.push(`Rate locked ${rateLockHours}h`);
  return chips;
}

/**
 * The signed-in Home screen.
 *
 * WHAT THIS SCREEN IS FOR. Kelvin, on the feedback that reshaped it: "we are
 * helping users shop and once logged in that is what the app should help the
 * user do". So the order of the page is the order of that job: ask for
 * something (a link, or words), then look at what we already hold, then the
 * parcels already moving, and only then the smaller cards.
 *
 * WHAT CAME OFF IT. "Shipping from the USA" — the lane card — is gone. It is a
 * marketing claim aimed at somebody deciding whether to sign up, and everyone
 * reading this screen has already decided; `/where-we-buy` still carries it,
 * waitlists and all. The live receipt did NOT come off: it moved down, out of
 * the hero's right-hand slot, because the last link you pasted is worth
 * keeping and is not the first thing a shopper wants.
 *
 * A Server Component: it does the one read, then hands pure props down. The
 * only client island is the ask box, which owns an input and nothing else.
 * The page shell's width, horizontal padding and top padding come from
 * `src/app/app/layout.tsx`; only the 44px inter-row rhythm is added here.
 */
export default async function AppHomePage() {
  // The quote cookie names the visitor's pre-sign-in locks; Home prices the
  // receipt under the customer's existing lock (never minting one).
  const view = await getHomeView(readQuoteSessionFromCookies(await cookies()));

  // `src/proxy.ts` already gates `/app`, so this is the belt-and-braces case of
  // a session that disappeared between the proxy check and the render.
  if (!view) redirect("/auth/login");

  // Passed down rather than read inside the components, so every relative time
  // on this render is measured against the same instant.
  const now = new Date();

  return (
    <div className="flex flex-col gap-11">
      {/*
        ── Row A · Ask ──────────────────────────────────────────────────
        Full width now that the receipt has moved down. The hero is the one
        thing on this screen that starts a purchase, and it no longer shares
        the fold with a card about something already bought.
      */}
      <div className="tm-up flex min-w-0 flex-col gap-[22px]">
        <GreetingChip greeting={view.greeting} />

        <h1 className="max-w-[18ch] font-display text-[34px] leading-[1.02] font-bold tracking-[-0.02em] sm:text-[42px] lg:text-[50px]">
          What would you like landed in Accra?
        </h1>

        <div className="flex flex-col gap-2.5">
          <HeroPasteBar
            stores={SUPPORTED_STORE_NAMES}
            catalogueCount={view.catalogueCount}
          />

          <ul className="flex flex-wrap gap-3.5 pl-1.5 text-[13px] leading-none font-medium text-tm-text-3">
            {trustChips(view.rateLockHours).map((chip) => (
              <li key={chip} className="flex items-center gap-[5px]">
                <Check className="size-4 shrink-0 text-tm-green" aria-hidden />
                {chip}
              </li>
            ))}
          </ul>
        </div>

        {/*
          The other two ways in. The paste bar above is one of three — browse
          what we have already priced, or describe a thing we then go and find —
          and until now only the paste bar was visible from here. It sits inside
          Row A rather than below it because all three answer the same question
          the `<h1>` just asked, and it stays deliberately quiet so the paste bar
          is still the obvious thing to reach for.
        */}
        <EntryDoors />
      </div>

      {/*
        ── Row A½ · On the water ────────────────────────────────────────
        Cars sit between the doors and the catalogue because a car comes
        through none of those doors: it is already bought and already on a
        ship, and the only thing a customer does with it is look and decide.
        That makes it the first thing on this screen that is not a way of
        asking us for something.

        Nothing is drawn when no listing is published — no placeholder, no
        sample vehicle. A made-up car is a made-up six-figure price beside a
        photograph of a vehicle that does not exist.
      */}
      {view.cars && (
        <CarsRail
          cars={view.cars.cars}
          total={view.cars.total}
          today={accraDay(now)}
        />
      )}

      {/*
        ── Row B · Shop ─────────────────────────────────────────────────
        Renders nothing at all when the catalogue holds nothing we could price.
        No placeholder shelf and no sample products: a made-up product on a
        price screen is a made-up price.
      */}
      <DealsShelf deals={view.deals} catalogueCount={view.catalogueCount} now={now} />

      {/* ── Row C · In motion ────────────────────────────────────────── */}
      {/*
        "Your freight box" sits to the right of the journeys, and is only drawn
        once there is a box: the card is the open bag's first consolidation box,
        so an empty bag has no percentage to be full of and the journeys take
        the whole row.
      */}
      <div
        className={
          view.freightBox
            ? "grid items-stretch gap-5 lg:grid-cols-[1.35fr_1fr]"
            : "grid"
        }
      >
        <JourneysInMotion journeys={view.journeys} />
        {view.freightBox && <FreightBoxCard box={view.freightBox} now={now} />}
      </div>

      {/*
        ── Row D · Everything else ──────────────────────────────────────
        The receipt keeps a half-width column of its own: it is a price
        breakdown, and the quarter-width slot the lane card used to sit in
        cannot hold one legibly. The two smaller cards stack beside it.
      */}
      <div className="grid gap-5 lg:grid-cols-2">
        <LiveReceiptCard receipt={view.receipt} now={now} />

        <div className="grid content-start gap-5">
          <PriceWatchCard
            watches={view.watches.watches}
            watchingCount={view.watches.watching_count}
          />
          <AskBuyerCard askBuyer={view.askBuyer} />
        </div>
      </div>
    </div>
  );
}
