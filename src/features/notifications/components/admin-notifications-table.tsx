import Link from "next/link";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminTableScroller,
} from "@/components/layout/admin";
import type { AdminNotificationRow } from "@/db/queries/admin-notifications";

import {
  notificationChannelLabel,
  notificationEventLabel,
  notificationStatusBadge,
  recipientLabel,
  relativeTime,
  stuckPendingLabel,
} from "./admin-notification-format";

/**
 * The delivery log table.
 *
 * A server component: every cell is derived from the row, nothing is
 * interactive except the link to the recipient, and the filters are links
 * rather than state. The previous admin table was a TanStack client table with
 * sorting, faceted filters and a global search over a list that — because of
 * the `profiles.email` bug this screen replaced — was always empty.
 *
 * `payload` is deliberately NOT rendered. It carries order totals, product
 * titles and hrefs, and printing arbitrary JSON into an admin page is how a
 * value written by an extraction ends up styled as though the product said it.
 * The row shows the facts the table owns; the recipient link leads to the
 * screen that can show the rest.
 */
export function AdminNotificationsTable({
  rows,
  now,
}: {
  rows: readonly AdminNotificationRow[];
  /** Passed in so the server's "2 h ago" survives hydration unchanged. */
  now: Date;
}) {
  return (
    <AdminTableScroller>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={ADMIN_TH}>
              Event
            </th>
            <th scope="col" className={ADMIN_TH}>
              Recipient
            </th>
            <th scope="col" className={ADMIN_TH}>
              Channel
            </th>
            <th scope="col" className={ADMIN_TH}>
              Status
            </th>
            <th scope="col" className={ADMIN_TH}>
              Created
            </th>
            <th scope="col" className={ADMIN_TH}>
              Delivered
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = notificationStatusBadge(row.status);
            const stuck = row.status === "pending" ? stuckPendingLabel(row.created_at, now) : null;
            const created = relativeTime(row.created_at, now);
            const sent = row.sent_at ? relativeTime(row.sent_at, now) : null;

            return (
              <tr key={row.id} className={ADMIN_TR}>
                <td className={ADMIN_TD}>
                  <span className="font-semibold">{notificationEventLabel(row.event)}</span>
                </td>
                <td className={ADMIN_TD}>
                  <Link
                    href={`/admin/users/${row.user_id}`}
                    className="font-medium text-tm-ink underline-offset-2 hover:underline"
                  >
                    {recipientLabel(row.recipient, row.user_id)}
                  </Link>
                </td>
                <td className={ADMIN_TD}>
                  <span className="text-tm-text-2">
                    {notificationChannelLabel(row.channel)}
                  </span>
                </td>
                <td className={ADMIN_TD}>
                  <div className="flex flex-col items-start gap-1">
                    <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                    {stuck ? (
                      <span className="text-[11px] leading-none font-semibold text-tm-amber">
                        {stuck}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                  {created ?? "—"}
                </td>
                <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                  {/*
                    `sent_at` is stamped only on success (markNotificationDelivered),
                    so a failed row has nothing here by design — an em dash, not
                    a zero and not the creation time.
                  */}
                  {sent ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </AdminTableScroller>
  );
}
