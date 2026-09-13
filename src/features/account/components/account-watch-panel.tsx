import Link from "next/link";

import { WatchRow, formatWatchingCount } from "@/features/watches/components";
import type { WatchListResponse } from "@/features/watches/types";
import { AccountEmpty, AccountPanel } from "./account-panel";

/**
 * Price watch — the account's own view of `price_watches`.
 *
 * Renders `WatchRow`, the same component `/app/watches` and the Home card use,
 * so a watch reads identically wherever it appears and there is one place that
 * decides how a price move is described. Adding and removing watches stays on
 * `/app/watches`: that screen owns the paste form and the nightly-job
 * explanation, and duplicating them here would be a second way to do the same
 * thing with its own bugs.
 *
 * `now` is passed down rather than read inside each row, so every "checked 6
 * hrs ago" on this render is measured from the same instant.
 */
export function AccountWatchPanel({
  watches,
  blurb,
  now,
}: {
  watches: WatchListResponse;
  blurb: string;
  now: Date;
}) {
  const counted = formatWatchingCount(watches.watching_count);

  return (
    <AccountPanel
      title="Price watch"
      blurb={blurb}
      action={
        <Link
          href="/app/watches"
          className="rounded-full border border-tm-border bg-tm-paper px-3.5 py-2 text-[13px] leading-none font-semibold transition-colors hover:border-tm-coral/40 hover:text-tm-coral-strong"
        >
          Manage watches
        </Link>
      }
    >
      {watches.watches.length === 0 ? (
        <AccountEmpty
          title="Nothing on watch"
          body="Paste a product link on the Price watch screen and we start a price history for it tonight — landed in GH₵, re-checked once a day."
        >
          <Link
            href="/app/watches"
            className="text-[13px] leading-none font-semibold text-tm-coral-strong underline-offset-2 hover:underline"
          >
            Go to Price watch
          </Link>
        </AccountEmpty>
      ) : (
        <>
          <ul>
            {watches.watches.map((item) => (
              <li key={item.watch.id} className="border-b border-tm-hairline last:border-b-0">
                <WatchRow item={item} scale="page" now={now} />
              </li>
            ))}
          </ul>
          <p className="text-xs leading-none font-medium text-tm-text-3">
            {counted ? `we re-check daily · ${counted}` : "we re-check daily"}
          </p>
        </>
      )}

      {/*
        Retired watches — ones the nightly job gave up on — are shown on
        `/app/watches`, which can afford to explain why a link stopped being
        readable. Repeating that explanation in a panel this size would either
        truncate it into something alarming or crowd out the live watches.
      */}
      {watches.retired.length > 0 ? (
        <p className="text-xs leading-[1.45] font-medium text-tm-text-3">
          We stopped checking {watches.retired.length === 1 ? "one link" : `${watches.retired.length} links`}.{" "}
          <Link href="/app/watches" className="font-semibold text-tm-coral-strong underline-offset-2 hover:underline">
            See which
          </Link>
        </p>
      ) : null}
    </AccountPanel>
  );
}
