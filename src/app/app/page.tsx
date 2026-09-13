import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Check } from "@phosphor-icons/react/ssr";

import { readQuoteSessionFromCookies } from "@/lib/quote-session";

import { SUPPORTED_STORE_NAMES } from "@/features/extraction/scrapers";
import { getHomeView } from "@/features/app-home/services/home.service";
import {
  AskBuyerCard,
  FreightBoxCard,
  GreetingChip,
  HeroPasteBar,
  JourneysInMotion,
  LaneCard,
  LiveReceiptCard,
} from "@/features/app-home/components";
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
 * The signed-in Home screen — `id="v2-home"` in the v2 mocks.
 *
 * A Server Component: it does the one read, then hands pure props down. The
 * only client island is the paste bar, which owns an input and nothing else.
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
      {/* ── Row A ─────────────────────────────────────────────────────── */}
      <div className="grid items-stretch gap-7 lg:grid-cols-[1.25fr_1fr]">
        <div className="tm-up flex min-w-0 flex-col justify-center gap-[22px]">
          <GreetingChip greeting={view.greeting} />

          <h1 className="font-display text-[34px] leading-[1.02] font-bold tracking-[-0.02em] sm:text-[42px] lg:text-[50px]">
            What would you like landed in Accra?
          </h1>

          <div className="flex flex-col gap-2.5">
            <HeroPasteBar stores={SUPPORTED_STORE_NAMES} />

            <ul className="flex flex-wrap gap-3.5 pl-1.5 text-[13px] leading-none font-medium text-tm-text-3">
              {trustChips(view.rateLockHours).map((chip) => (
                <li key={chip} className="flex items-center gap-[5px]">
                  <Check className="size-4 shrink-0 text-tm-green" aria-hidden />
                  {chip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <LiveReceiptCard receipt={view.receipt} now={now} />
      </div>

      {/* ── Row B ─────────────────────────────────────────────────────── */}
      {/*
        The mock puts "Your freight box" to the right of the journeys. It is
        only drawn once there is a box: the card is the open bag's first
        consolidation box, so an empty bag has no percentage to be full of and
        the journeys take the whole row, as they did before Phase 4.
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
        ── Row C ───────────────────────────────────────────────────────
        The mock nests a grid here: Price watch takes the left half, and the
        two small cards split the right half between them.
      */}
      <div className="grid gap-5 lg:grid-cols-2">
        <PriceWatchCard
          watches={view.watches.watches}
          watchingCount={view.watches.watching_count}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <LaneCard lanes={view.lanes} />
          <AskBuyerCard askBuyer={view.askBuyer} />
        </div>
      </div>
    </div>
  );
}
