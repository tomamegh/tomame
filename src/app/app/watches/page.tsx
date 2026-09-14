import type { Metadata } from "next";
import { redirect } from "next/navigation";
// Type-only, so the root barrel's `useContext` never reaches a server render.
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsClockwise,
  BookmarkSimple,
  ChartLineDown,
  Coins,
} from "@phosphor-icons/react/ssr";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listWatches } from "@/features/watches/services/watches.service";
import type { RetiredWatch } from "@/features/watches/types";
import { WatchRow } from "@/features/watches/components";
import {
  formatWatchingCount,
  watchDisplayName,
} from "@/features/watches/components/format";
import { AddWatchForm } from "./_components/add-watch-form";
import { RemoveWatchButton } from "./_components/remove-watch-button";

export const metadata: Metadata = {
  title: "Price watch · Tomame",
  description:
    "Watch a product link and we re-check its landed price in GH₵ once a day.",
};

/**
 * The destination behind the nav's "Price watch" tab.
 *
 * A Server Component: it does the one read through `listWatches` — which is
 * owner-scoped and RLS-bound — and hands pure props to the row components. The
 * only client code on the screen is the add form and one remove button per row,
 * each of which owns a mutation and nothing else.
 *
 * Every figure here is server-derived. The page never computes a delta, and it
 * never renders `delta_ghs` as a price move: that number carries the day's
 * exchange rate inside it, so a strengthening cedi would otherwise read as a
 * discount nobody gave.
 */
export default async function WatchesPage() {
  const user = await getAuthenticatedUser();
  // `src/proxy.ts` already gates `/app`; this is the belt-and-braces case of a
  // session that disappeared between that check and this render.
  if (!user) redirect("/auth/login");

  const { watches, watching_count, retired } = await listWatches(user.id);

  // Passed down rather than read inside each row, so every "checked 6 hrs ago"
  // on this render is measured against the same instant.
  const now = new Date();
  const counted = formatWatchingCount(watching_count);

  return (
    <div className="flex flex-col gap-8">
      <header className="tm-up flex flex-col gap-3">
        <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[42px]">
          Price watch
        </h1>
        <p className="max-w-[58ch] text-[15px] leading-[1.5] font-medium text-tm-text-2">
          Save a product link and we re-check it once a day, landed in GH₵:
          item, US sales tax, our fee and freight at that day&rsquo;s rate. You
          get the whole picture before you decide whether to buy now or wait.
        </p>
      </header>

      <section
        aria-labelledby="add-watch-heading"
        className="tm-up flex flex-col gap-3 [animation-delay:0.08s]"
      >
        <h2 id="add-watch-heading" className="sr-only">
          Add a price watch
        </h2>
        <AddWatchForm />
      </section>

      <section
        aria-labelledby="watch-list-heading"
        className="tm-up flex flex-col gap-2 rounded-[24px] border border-tm-border bg-card p-6 [animation-delay:0.16s]"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 pb-2">
          <h2
            id="watch-list-heading"
            className="font-display text-[22px] leading-none font-bold"
          >
            Your watches
          </h2>
          <span className="text-xs leading-none font-medium text-tm-text-3">
            {counted ? `we re-check daily · ${counted}` : "we re-check daily"}
          </span>
        </header>

        {watches.length > 0 ? (
          <ul>
            {watches.map((item) => (
              <li
                key={item.watch.id}
                className="border-b border-tm-hairline last:border-b-0"
              >
                <WatchRow
                  item={item}
                  scale="page"
                  now={now}
                  action={
                    <RemoveWatchButton
                      watchId={item.watch.id}
                      productName={watchDisplayName(item.watch)}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyWatches />
        )}
      </section>

      {retired.length > 0 && <RetiredWatches retired={retired} />}
    </div>
  );
}

/**
 * Watches the nightly job gave up on after repeated failures.
 *
 * These exist because `is_active` means two different things — a customer
 * pausing a watch, and the job retiring one — and every list query filters them
 * out. Without this section a watch simply disappears and its owner goes on
 * believing a price is still being tracked. Pasting the link again re-arms it
 * (`createWatch` reactivates a retired row with a fresh baseline), which is why
 * the copy points back at the form rather than offering a dead retry button.
 */
function RetiredWatches({ retired }: { retired: RetiredWatch[] }) {
  return (
    <section
      aria-labelledby="retired-watch-heading"
      className="flex flex-col gap-3 rounded-[24px] border border-tm-border bg-tm-amber-bg/50 p-6"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="retired-watch-heading"
          className="font-display text-[17px] leading-none font-bold"
        >
          We stopped checking {retired.length === 1 ? "one link" : `${retired.length} links`}
        </h2>
        <p className="max-w-[58ch] text-[13px] leading-[1.45] font-medium text-tm-text-2">
          These pages could not be read several nights running. Usually the
          item was delisted or the store changed the link. Paste the link above
          again to start watching it afresh.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {retired.map(({ watch, last_error }) => (
          <li
            key={watch.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] leading-[1.4]"
          >
            <span className="font-semibold">{watchDisplayName(watch)}</span>
            {last_error && (
              <span className="text-tm-text-3">· {last_error}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Each explainer line is a fact about the system, not a feature boast. */
const HOW_IT_WORKS: readonly { icon: Icon; title: string; body: string }[] = [
  {
    icon: ArrowsClockwise,
    title: "Re-checked once a day",
    body: "A nightly job re-reads every watched link. Figures here are the last reading, not a live price; the row tells you when it was taken.",
  },
  {
    icon: Coins,
    title: "Priced the way you pay",
    body: "Each reading is the full landed total in GH₵ at that day's rate, so the number you compare is the number you would be charged.",
  },
  {
    icon: ChartLineDown,
    title: "Trends ignore the cedi",
    body: "Rises and drops are measured in the store's own currency. A cedi swing moves your GH₵ total, but it is never reported as a price cut.",
  },
];

/**
 * The honest default — this account has no watches, and most new ones will not.
 * It explains the mechanism instead of showing sample rows: a made-up watch on
 * a price screen is a made-up price.
 */
function EmptyWatches() {
  return (
    <div className="flex flex-col gap-5 rounded-[16px] bg-tm-paper p-6 sm:p-8">
      <span className="flex size-12 items-center justify-center rounded-[14px] bg-tm-tint text-tm-coral">
        <BookmarkSimple weight="duotone" className="size-6" aria-hidden />
      </span>

      <div className="flex flex-col gap-2">
        <p className="font-display text-[19px] leading-[1.25] font-bold">
          Nothing on watch yet
        </p>
        <p className="max-w-[52ch] text-sm leading-[1.5] font-medium text-tm-text-2">
          Paste a link above from any store we buy from, and we will start a price
          history for it tonight.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {HOW_IT_WORKS.map(({ icon: Glyph, title, body }) => (
          <li key={title} className="flex flex-col gap-1.5">
            <Glyph
              weight="duotone"
              className="size-5 text-tm-coral"
              aria-hidden
            />
            <p className="text-[13px] leading-[1.3] font-semibold">{title}</p>
            <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
              {body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
