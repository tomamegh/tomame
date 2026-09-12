import Link from "next/link";
import { ArrowRight, BookmarkSimple } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { WatchListItem } from "../types";
import { formatWatchingCount } from "./format";
import { WatchRow } from "./watch-row";

/** Rows the Home card shows before it hands off to the full screen. */
export const HOME_WATCH_LIMIT = 3;

export interface PriceWatchCardProps {
  /**
   * `listWatches(userId).watches` — each entry already carries its
   * server-derived stats. Newest first. An empty array is a real state, not a
   * loading state.
   */
  watches: readonly WatchListItem[];
  /**
   * `listWatches(userId).watching_count` — the customer's real number of active
   * watches. The mock hardcodes "3 watching" above two rows; this is the count
   * that makes the line true, and it can exceed `watches.length` once the list
   * is capped by `limit`.
   */
  watchingCount: number;
  /** Rows rendered before the overflow link takes over. Defaults to 3. */
  limit?: number;
  className?: string;
}

/**
 * "Price watch" — Row C left in `id="v2-home"`.
 *
 * A Server Component with no data access of its own: the page calls
 * `listWatches` and hands the result down. Everything it prints already exists
 * on the row — no delta, direction or count is derived here.
 *
 * The header's right-hand line is the card's honesty contract. "we re-check
 * daily" is the literal cadence of the cron in migration 042; a customer who
 * believes these figures are live will read a stale price as a live one.
 */
export function PriceWatchCard({
  watches,
  watchingCount,
  limit = HOME_WATCH_LIMIT,
  className,
}: PriceWatchCardProps) {
  const shown = watches.slice(0, Math.max(0, limit));
  const counted = formatWatchingCount(watchingCount);
  const hidden = Math.max(0, watchingCount - shown.length);

  return (
    <section
      aria-labelledby="price-watch-heading"
      className={cn(
        "tm-up flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-6",
        "[animation-delay:0.34s]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <h2
          id="price-watch-heading"
          className="shrink-0 font-display text-[22px] leading-none font-bold"
        >
          Price watch
        </h2>
        <span className="text-right text-xs leading-none font-medium text-tm-text-3">
          {counted ? `we re-check daily · ${counted}` : "we re-check daily"}
        </span>
      </header>

      {shown.length > 0 ? (
        <>
          <ul>
            {shown.map((item) => (
              <li
                key={item.watch.id}
                className="border-b border-tm-hairline last:border-b-0"
              >
                <WatchRow item={item} scale="compact" />
              </li>
            ))}
          </ul>

          <Link
            href="/app/watches"
            className="inline-flex items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
          >
            {hidden > 0
              ? `${hidden} more watching`
              : "Manage price watches"}
            <ArrowRight weight="bold" className="size-3.5" aria-hidden />
          </Link>
        </>
      ) : (
        <EmptyPriceWatch />
      )}
    </section>
  );
}

/**
 * What a new customer actually sees. It explains the mechanism and offers the
 * next step rather than showing a sample row, which would be indistinguishable
 * from a real watch — and which, on a price card, would be a fabricated price.
 */
function EmptyPriceWatch() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[16px] bg-tm-paper p-6">
      <span className="flex size-11 items-center justify-center rounded-[12px] bg-tm-tint text-tm-coral">
        <BookmarkSimple weight="duotone" className="size-[22px]" aria-hidden />
      </span>
      <p className="text-sm leading-[1.45] font-semibold">
        Nothing on watch yet
      </p>
      <p className="max-w-[46ch] text-[13px] leading-[1.45] font-medium text-tm-text-2">
        Save a product link and we re-check its price once a day, landed in
        GH₵ — so you know whether to buy now or wait.
      </p>
      <Link
        href="/app/watches"
        className="inline-flex items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
      >
        Watch a price
        <ArrowRight weight="bold" className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
