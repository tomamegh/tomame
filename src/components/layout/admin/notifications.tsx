"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BellIcon, MailIcon, MessageCircleIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminBadge } from "@/components/layout/admin/admin-page";
import {
  notificationEventLabel,
  notificationStatusBadge,
  recipientLabel,
  relativeTime,
} from "@/features/notifications/components/admin-notification-format";
import { apiFetch } from "@/lib/auth/api-helpers";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * The admin header's bell — the delivery log at a glance.
 *
 * WHAT IT MEANS. Unlike the customer's bell, this one is not about unread
 * messages: an admin is not the recipient of most of these rows. The badge
 * counts what is WRONG — failed and pending sends — because those are the rows
 * that represent a customer sitting with no email. When nothing is wrong the
 * badge is absent rather than zero, the same rule the sidebar's queue badges
 * follow.
 *
 * WHY IT HAS ITS OWN QUERY. The shared `useAdminNotifications` hook is typed
 * around `NotificationWithUser`, whose `user.email` comes from a select that
 * cannot succeed — `profiles` has no email column, so the endpoint behind it
 * returned an empty list on every environment and this bell was permanently,
 * silently empty. The route now answers from
 * `db/queries/admin-notifications`, and this reads that shape directly.
 *
 * The panel deliberately does not render `payload`. It is arbitrary JSON
 * written by jobs, and a popover is not the place to print it; the row links to
 * the recipient and the footer links to the full log.
 */

const PANEL_LIMIT = 12;

/**
 * The endpoint's response, declared here rather than imported from
 * `db/queries/admin-notifications`.
 *
 * That module is `server-only`, and even a type-only import of it from a client
 * component is a trap waiting for the first person who deletes the `type`
 * keyword while tidying an import list. This is the HTTP contract of
 * `/api/admin/notifications`, which is the client's business anyway — the query
 * module's row type is the database's.
 */
interface AdminNotificationFeedRow {
  id: string;
  user_id: string;
  channel: "email" | "whatsapp";
  event: string;
  status: "pending" | "sent" | "failed";
  created_at: string;
  sent_at: string | null;
  recipient: { id: string; first_name: string | null; last_name: string | null } | null;
}

interface AdminNotificationFeed {
  notifications: AdminNotificationFeedRow[];
  count: number;
  counts: { pending: number; sent: number; failed: number; total: number; failedLast24h: number };
}

function useAdminNotificationFeed(enabled: boolean) {
  return useQuery<ApiSuccessResponse<AdminNotificationFeed>, Error, AdminNotificationFeed>({
    queryKey: ["notifications", "admin", "bell", PANEL_LIMIT],
    queryFn: () =>
      apiFetch<ApiSuccessResponse<AdminNotificationFeed>>(
        `/api/admin/notifications?limit=${PANEL_LIMIT}`,
      ),
    select: (res) => res.data,
    staleTime: 30_000,
    // The counts drive the badge, so this one runs on every admin page; the
    // panel's rows come back in the same response rather than a second request
    // when it opens.
    enabled,
  });
}

function AdminNotifications() {
  const [open, setOpen] = useState(false);
  const { data, isPending, error } = useAdminNotificationFeed(true);

  const rows = data?.notifications ?? [];
  const needsAttention = (data?.counts.failed ?? 0) + (data?.counts.pending ?? 0);
  // One instant per render pass, so two rows cannot disagree about "now".
  const now = new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            needsAttention > 0
              ? `Notifications — ${needsAttention} needing attention`
              : "Notifications"
          }
          className="relative flex size-9 items-center justify-center rounded-full border border-tm-border bg-card text-tm-text-2 transition-colors hover:bg-tm-paper hover:text-tm-ink"
        >
          <BellIcon className="size-[18px]" aria-hidden />
          {needsAttention > 0 ? (
            <span className="tm-nums absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-tm-coral px-1 text-[10px] leading-none font-bold text-white">
              {needsAttention > 99 ? "99+" : needsAttention}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="flex w-[360px] flex-col overflow-hidden rounded-[18px] border-tm-border bg-card p-0"
        style={{ maxHeight: "min(520px, 78vh)" }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-tm-hairline px-4 py-3">
          <h2 className="font-display text-[15px] leading-none font-bold text-tm-ink">
            Delivery log
          </h2>
          {needsAttention > 0 ? (
            <AdminBadge tone="coral">{needsAttention} to look at</AdminBadge>
          ) : (
            <AdminBadge tone="green">All delivered</AdminBadge>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isPending ? (
            <ul aria-busy="true" className="flex flex-col">
              {Array.from({ length: 4 }).map((_, index) => (
                <li key={index} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                </li>
              ))}
            </ul>
          ) : error ? (
            <p className="px-4 py-8 text-center text-[13px] leading-[1.5] font-medium text-tm-coral-strong">
              {error.message}
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-start gap-2 px-4 py-8">
              <p className="font-display text-[15px] leading-[1.25] font-bold text-tm-ink">
                Nothing sent yet
              </p>
              <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
                A row is written here before any message is attempted, so an empty log means
                nothing has triggered one.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-tm-hairline">
              {rows.map((row) => {
                const badge = notificationStatusBadge(row.status);
                const Icon = row.channel === "email" ? MailIcon : MessageCircleIcon;
                const age = relativeTime(row.created_at, now);

                return (
                  <li key={row.id}>
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-tm-paper",
                        row.status !== "sent" && "bg-tm-pill-bg/50",
                      )}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-tm-paper text-tm-text-2">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] leading-none font-semibold text-tm-ink">
                            {notificationEventLabel(row.event)}
                          </span>
                          {age ? (
                            <span className="tm-nums shrink-0 text-[11px] leading-none font-medium text-tm-text-3">
                              {age}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                          <span className="truncate text-[12px] leading-none font-medium text-tm-text-2">
                            {recipientLabel(row.recipient, row.user_id)}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-tm-hairline px-4 py-2.5">
          <span className="tm-nums text-[11px] leading-none font-medium text-tm-text-3">
            {data ? `${rows.length} of ${data.count.toLocaleString("en-GB")}` : ""}
          </span>
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="text-[12px] leading-none font-semibold text-tm-coral-strong underline underline-offset-2"
          >
            Open the full log
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}

export default AdminNotifications;
