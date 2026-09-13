import Link from "next/link";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminTableScroller,
} from "@/components/layout/admin/admin-page";
import type { AdminBagLine, AdminBagRow } from "@/db/queries/admin-bags";
import { formatAge } from "@/features/orders/components/admin-order-display";
import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import { bagLineStateCopy, bagOwnerLabel, isBagStale } from "./admin-bag-format";

/**
 * Open bags — the earliest signal the business has about demand.
 *
 * WHY THIS SCREEN EXISTS. Migration 048 gave customers a bag and there has never
 * been any administration for it: nobody could see what people were putting in,
 * which lines the extractor had failed on, or which bags had been sitting long
 * enough to be worth a message. All of that was visible only to the customer who
 * owned it.
 *
 * **EVERY FIGURE HERE IS A SNAPSHOT.** `db/queries/admin-bags.ts` reads
 * `cart_items.pricing` — the breakdown stored when the line was added — and does
 * not re-price. The customer's own bag re-prices on every render under their
 * rate lock, so these two figures will differ whenever an FX rate or a pricing
 * constant has moved since. The card says so in its blurb, and it must go on
 * saying so: a stale figure presented as a live quote is the exact failure this
 * screen was built to avoid.
 */

export function AdminBagsBoard({
  bags,
  now,
  emptyBody,
}: {
  bags: AdminBagRow[];
  /** Passed in so every row ages against ONE clock rather than re-reading it per row. */
  now: Date;
  emptyBody: string;
}) {
  if (bags.length === 0) {
    return (
      <AdminCard index={1}>
        <AdminEmpty title="No bags here" body={emptyBody} />
      </AdminCard>
    );
  }

  return (
    <AdminCard
      index={1}
      flush
      title="Open bags"
      blurb="Values are the price stored when each line was added, not a live quote — the customer's own bag re-prices every time they open it."
    >
      <AdminTableScroller>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={ADMIN_TH} scope="col">
                Whose
              </th>
              <th className={cn(ADMIN_TH, "text-right")} scope="col">
                Lines
              </th>
              <th className={cn(ADMIN_TH, "text-right")} scope="col">
                Items
              </th>
              <th className={cn(ADMIN_TH, "text-right")} scope="col">
                Snapshot value
              </th>
              <th className={ADMIN_TH} scope="col">
                State
              </th>
              <th className={ADMIN_TH} scope="col">
                Last touched
              </th>
            </tr>
          </thead>
          <tbody>
            {bags.map((bag) => (
              <BagRow key={bag.id} bag={bag} now={now} />
            ))}
          </tbody>
        </table>
      </AdminTableScroller>

      <div className="border-t border-tm-hairline px-5 py-4">
        <p className="text-[12px] leading-[1.5] font-medium text-tm-text-3">
          A bag with no lines is not listed: an empty cart row is left behind by a
          customer who cleared their bag, and it is not demand.
        </p>
      </div>
    </AdminCard>
  );
}

function BagRow({ bag, now }: { bag: AdminBagRow; now: Date }) {
  const stale = isBagStale(bag, now);
  const blocked = bag.blocked_line_count > 0;

  return (
    <>
      <tr className={ADMIN_TR}>
        <td className={ADMIN_TD}>
          <div className="flex flex-col gap-0.5">
            {/*
              A signed-in bag links to the account behind it; an anonymous one has
              no account to link to, and the row says that plainly rather than
              rendering a dead link to nowhere.
            */}
            {bag.owner.user_id ? (
              <Link
                href={`/admin/users/${bag.owner.user_id}`}
                className="text-[13px] leading-none font-semibold text-tm-ink hover:text-tm-coral-strong hover:underline"
              >
                {bagOwnerLabel(bag)}
              </Link>
            ) : (
              <span className="text-[13px] leading-none font-semibold text-tm-ink">
                {bagOwnerLabel(bag)}
              </span>
            )}
            <span className="text-[11.5px] leading-none font-medium text-tm-text-3">
              {bag.owner.kind === "anonymous" ? "Not signed in" : "Signed in"}
            </span>
          </div>
        </td>
        <td className={cn(ADMIN_TD, "tm-nums text-right font-semibold")}>{bag.line_count}</td>
        <td className={cn(ADMIN_TD, "tm-nums text-right font-semibold")}>{bag.item_count}</td>
        <td className={cn(ADMIN_TD, "text-right")}>
          <span className="tm-nums text-[13px] font-semibold text-tm-ink">
            {formatGhs(bag.snapshot_value_ghs)}
          </span>
          {bag.priced_line_count < bag.line_count ? (
            <span className="block text-[11px] leading-none font-medium text-tm-text-3">
              {bag.priced_line_count} of {bag.line_count} priced
            </span>
          ) : null}
        </td>
        <td className={ADMIN_TD}>
          <div className="flex flex-wrap items-center gap-1.5">
            {blocked ? (
              <AdminBadge tone="amber">
                {bag.blocked_line_count} blocked
              </AdminBadge>
            ) : (
              <AdminBadge tone="green">Ready to pay</AdminBadge>
            )}
            {stale ? <AdminBadge tone="muted">Sitting</AdminBadge> : null}
          </div>
        </td>
        <td className={ADMIN_TD}>
          <span className="tm-nums text-[12.5px] font-medium text-tm-text-3">
            {formatAge(bag.updated_at, now) ?? "—"}
          </span>
        </td>
      </tr>
      <tr className="border-t border-tm-hairline">
        {/*
          The lines live in a `<details>` rather than behind a click handler, so
          the whole screen stays a server component. Expanding one is a browser
          feature, not a React state machine.
        */}
        <td colSpan={6} className="px-4 pb-3">
          <details className="group">
            <summary className="cursor-pointer list-none text-[12px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink">
              <span className="group-open:hidden">Show what is in it</span>
              <span className="hidden group-open:inline">Hide</span>
            </summary>
            <ul className="mt-2.5 flex flex-col gap-2">
              {bag.lines.map((line) => (
                <BagLineRow key={line.id} line={line} />
              ))}
            </ul>
          </details>
        </td>
      </tr>
    </>
  );
}

function BagLineRow({ line }: { line: AdminBagLine }) {
  const state = bagLineStateCopy(line.state);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-tm-paper px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-1 max-w-[52ch] text-[12.5px] leading-[1.35] font-semibold text-tm-ink">
          {/*
            A line whose paste is still being read has no title yet, and the URL
            is the only thing there is to show. Neither is invented.
          */}
          {line.title ?? line.product_url ?? "Link not recorded"}
        </span>
        {line.title && line.product_url ? (
          <a
            href={line.product_url}
            target="_blank"
            rel="noreferrer noopener"
            className="line-clamp-1 max-w-[52ch] text-[11.5px] font-medium break-all text-tm-text-3 hover:text-tm-coral-strong hover:underline"
          >
            {line.product_url}
          </a>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="tm-nums text-[12px] font-medium text-tm-text-2">× {line.quantity}</span>
        <span className="tm-nums text-[12.5px] font-semibold text-tm-ink">
          {line.snapshot_total_ghs != null ? formatGhs(line.snapshot_total_ghs) : "—"}
        </span>
        <AdminBadge tone={state.tone}>{state.label}</AdminBadge>
      </div>
    </li>
  );
}
