import Link from "next/link";

import {
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminStat,
} from "@/components/layout/admin";
import {
  getAdminNotificationCounts,
  listNotificationsForAdmin,
  listRecentNotificationEvents,
  type AdminNotificationChannel,
  type AdminNotificationStatus,
} from "@/db/queries/admin-notifications";
import { AdminNotificationsTable } from "@/features/notifications/components/admin-notifications-table";
import { summariseEvents } from "@/features/notifications/components/admin-notification-format";
import { formatCount } from "@/features/admin/components/dashboard-format";
import { cn } from "@/lib/utils";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications · Tomame admin",
  description: "Every message the platform has sent, and whether it landed.",
};

/**
 * `/admin/notifications` — what the platform told customers, and who it failed
 * to tell.
 *
 * A server component. Filters are links that change `?status=` rather than
 * client state, so a filtered view is a URL an admin can keep open or send to
 * somebody else, and the whole screen ships no JavaScript.
 *
 * THE FIGURE THAT MATTERS is failures. A `failed` row is a customer who was
 * never told something we decided to tell them — an order confirmation, a price
 * drop, a paste that finished pricing — so it leads the tiles and it is the
 * only filter offered as a shortcut from the empty state.
 *
 * NO RETRY BUTTON, deliberately. Re-sending means re-running the transport that
 * failed and re-deciding whether the row may move from `failed` back to
 * `pending`, which is a state-machine change (CLAUDE.md: transitions are
 * server-side, explicit and validated) and a mail-sending path, not a button.
 * A retry that silently did nothing would be worse than none.
 */

const ROW_LIMIT = 100;
const EVENT_SAMPLE = 500;

const STATUS_FILTERS: { value: AdminNotificationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
];

function parseStatus(value: string | undefined): AdminNotificationStatus | undefined {
  return value === "sent" || value === "pending" || value === "failed" ? value : undefined;
}

function parseChannel(value: string | undefined): AdminNotificationChannel | undefined {
  return value === "email" || value === "whatsapp" ? value : undefined;
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = parseStatus(first(params.status));
  const channel = parseChannel(first(params.channel));
  const event = first(params.event);

  // One instant for the whole render, so every "2 h ago" on the page is
  // measured from the same moment.
  const now = new Date();

  const [counts, rows, eventSample] = await Promise.all([
    getAdminNotificationCounts(now),
    listNotificationsForAdmin({ status, channel, event }, ROW_LIMIT),
    listRecentNotificationEvents(EVENT_SAMPLE),
  ]);

  const breakdown = summariseEvents(eventSample);
  const filtered = status != null || channel != null || event != null;

  return (
    <AdminPage
      title="Notifications"
      blurb="Every message the platform decided to send, on which channel, and whether it landed. A failed row is a customer who was never told."
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((filter) => {
            const active = (status ?? "all") === filter.value;
            const href =
              filter.value === "all"
                ? "/admin/notifications"
                : `/admin/notifications?status=${filter.value}`;
            return (
              <Link
                key={filter.value}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] leading-none font-semibold transition-colors",
                  active
                    ? "border-tm-coral/40 bg-tm-pill-bg text-tm-coral-strong"
                    : "border-tm-border bg-card text-tm-text-2 hover:bg-tm-paper",
                )}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label="Failed"
          value={formatCount(counts.failed)}
          detail={
            counts.failedLast24h > 0
              ? `${formatCount(counts.failedLast24h)} in the last 24 hours`
              : "None in the last 24 hours"
          }
          tone={counts.failed > 0 ? "coral" : "green"}
          href="/admin/notifications?status=failed"
        />
        <AdminStat
          index={1}
          label="Pending"
          value={formatCount(counts.pending)}
          detail="Written, but the send never closed out"
          tone={counts.pending > 0 ? "amber" : "green"}
          href="/admin/notifications?status=pending"
        />
        <AdminStat
          index={2}
          label="Sent"
          value={formatCount(counts.sent)}
          detail="Accepted by the transport"
          tone="green"
          href="/admin/notifications?status=sent"
        />
        <AdminStat
          index={3}
          label="All messages"
          value={formatCount(counts.total)}
          detail="Since the platform started keeping the log"
          tone="neutral"
        />
      </div>

      {breakdown.length > 0 ? (
        <AdminCard
          index={1}
          title="By event"
          blurb={`The last ${formatCount(Math.min(EVENT_SAMPLE, counts.total))} messages, grouped. Events with failures are listed first.`}
        >
          <ul className="flex flex-col gap-2">
            {breakdown.map((row) => (
              <li
                key={row.event}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-tm-paper px-4 py-3"
              >
                <Link
                  href={`/admin/notifications?event=${encodeURIComponent(row.event)}`}
                  className="text-[13px] leading-none font-semibold text-tm-ink underline-offset-2 hover:underline"
                >
                  {row.label}
                </Link>
                <div className="tm-nums flex flex-wrap items-center gap-4 text-[12px] leading-none font-semibold">
                  <span className="text-tm-green">{formatCount(row.sent)} sent</span>
                  {row.pending > 0 ? (
                    <span className="text-tm-amber">{formatCount(row.pending)} pending</span>
                  ) : null}
                  {row.failed > 0 ? (
                    <span className="text-tm-coral-strong">{formatCount(row.failed)} failed</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}

      <AdminCard
        index={2}
        title={filtered ? "Filtered messages" : "Recent messages"}
        blurb={
          rows.length >= ROW_LIMIT
            ? `Newest ${formatCount(ROW_LIMIT)} shown. Filter by status to see further back.`
            : "Newest first."
        }
        action={
          filtered ? (
            <Link
              href="/admin/notifications"
              className="text-[12px] leading-none font-semibold text-tm-text-2 underline underline-offset-2 hover:text-tm-ink"
            >
              Clear filters
            </Link>
          ) : null
        }
        flush={rows.length > 0}
      >
        {rows.length === 0 ? (
          <AdminEmpty
            title={filtered ? "Nothing matches this filter" : "No notifications yet"}
            body={
              filtered
                ? "No message in the log has this status, channel and event. The log itself is not empty — clear the filter to see it."
                : "Nothing has been sent. The platform writes a row here before it attempts any message, so an empty log means no order, price drop or paste has triggered one yet."
            }
          >
            {filtered ? (
              <Link
                href="/admin/notifications"
                className="text-[13px] leading-none font-semibold text-tm-coral-strong underline underline-offset-2"
              >
                Show everything
              </Link>
            ) : null}
          </AdminEmpty>
        ) : (
          <AdminNotificationsTable rows={rows} now={now} />
        )}
      </AdminCard>
    </AdminPage>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
