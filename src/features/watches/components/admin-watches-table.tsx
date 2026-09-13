import Link from "next/link";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminTableScroller,
} from "@/components/layout/admin";
import type { AdminWatchRow } from "@/db/queries/admin-watches";
import { recipientLabel, relativeTime } from "@/features/notifications/components/admin-notification-format";
import { formatUsd } from "@/features/marketing/format";

import { failureLabel, watchHealth, watchHealthBadge } from "./admin-watch-format";

/**
 * The watch table.
 *
 * Server-rendered, and deliberately read-only. A watch belongs to a customer —
 * pausing, re-arming or deleting one changes something they set up and expect
 * to keep running, and none of those has a server-side path an admin is
 * supposed to use. The screen's job is to show whether the batch is working;
 * acting on a bad link is a fix to the resolver, not a button here.
 *
 * `last_error` is shown in full on the failing rows because it is the whole
 * diagnosis: a 404 means a delisted product and a timeout means the resolver.
 */
export function AdminWatchesTable({
  rows,
  now,
  showError = false,
}: {
  rows: readonly AdminWatchRow[];
  /** One instant for the page, so every relative time agrees. */
  now: Date;
  /** Adds the last error column — worth the width only on the failing list. */
  showError?: boolean;
}) {
  return (
    <AdminTableScroller>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={ADMIN_TH}>
              Product
            </th>
            <th scope="col" className={ADMIN_TH}>
              Customer
            </th>
            <th scope="col" className={ADMIN_TH}>
              State
            </th>
            <th scope="col" className={ADMIN_TH}>
              Last price
            </th>
            <th scope="col" className={ADMIN_TH}>
              Last checked
            </th>
            <th scope="col" className={ADMIN_TH}>
              Last alert
            </th>
            {showError ? (
              <th scope="col" className={ADMIN_TH}>
                Last error
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const health = watchHealth(row);
            const badge = watchHealthBadge(health);
            const failures = failureLabel(row.consecutive_failures);

            return (
              <tr key={row.id} className={ADMIN_TR}>
                <td className={ADMIN_TD}>
                  <div className="flex max-w-[36ch] flex-col gap-1">
                    <span className="truncate font-semibold">
                      {row.product_name ?? "Unnamed product"}
                    </span>
                    <a
                      href={row.product_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-[12px] leading-none font-medium text-tm-text-3 underline-offset-2 hover:underline"
                    >
                      {row.product_url}
                    </a>
                  </div>
                </td>
                <td className={ADMIN_TD}>
                  <Link
                    href={`/admin/users/${row.user_id}`}
                    className="font-medium text-tm-ink underline-offset-2 hover:underline"
                  >
                    {recipientLabel(row.owner, row.user_id)}
                  </Link>
                </td>
                <td className={ADMIN_TD}>
                  <div className="flex flex-col items-start gap-1">
                    <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                    {failures ? (
                      <span className="text-[11px] leading-none font-semibold text-tm-text-3">
                        {failures}
                      </span>
                    ) : null}
                    {!row.notify_on_drop ? (
                      // A watch that is checked and never tells anybody is a
                      // real, deliberate state — the customer turned alerts off.
                      <span className="text-[11px] leading-none font-semibold text-tm-text-3">
                        Alerts off
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={`${ADMIN_TD} tm-nums whitespace-nowrap`}>
                  {row.last_price_usd != null ? formatUsd(row.last_price_usd) : "—"}
                </td>
                <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                  {row.last_checked_at
                    ? (relativeTime(row.last_checked_at, now) ?? "—")
                    : "Never"}
                </td>
                <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                  {/*
                    `notified_at` records that an alert was DECIDED. Whether the
                    email landed is the notification row's business, which is
                    why the alerts card below reads the log rather than this.
                  */}
                  {row.notified_at ? (relativeTime(row.notified_at, now) ?? "—") : "Never"}
                </td>
                {showError ? (
                  <td className={`${ADMIN_TD} max-w-[42ch] text-tm-text-2`}>
                    {row.last_error ?? "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </AdminTableScroller>
  );
}
