"use client";

import { BellSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/features/notifications/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { NOTIFICATION_KINDS, notificationKind, type NotificationKind } from "@/features/notifications/notification-kind";
import { describeNotification } from "@/features/notifications/describe";
import { useAnnouncementReceipt, useAnnouncements } from "@/features/announcements/hooks/useAnnouncements";
import { notificationsLabel } from "./links";
import { FOCUS_RING, NAV_ICON_BUTTON } from "./styles";

interface NotificationBellProps {
  /**
   * Server-rendered unread count, so the dot is correct on first paint instead
   * of appearing a beat later. The live query takes over once it resolves.
   */
  initialUnreadCount: number;
}

/**
 * Nav bell with the unread dot — `design/TmNavLight.dc.html`.
 *
 * The dot is `count(*) where read_at is null` (migration 041), never a literal:
 * the mock hardcodes it, and the old `dashboard-navbar.tsx` did too.
 *
 * The panel is what makes the dot honest — without somewhere to read them,
 * nothing would ever clear `read_at` and the dot would burn forever.
 *
 * Client component: it has a popover, a mutation and live counts. Imports
 * `BellSimple` from the interactive barrel rather than `/ssr` because this file
 * is already a client boundary.
 */
export function NotificationBell({ initialUnreadCount }: NotificationBellProps) {
  // The list is fetched only once the panel opens. Until then the dot comes
  // from the server-rendered count, so an ordinary page load costs no request.
  const [open, setOpen] = useState(false);

  const { data: liveUnread } = useUnreadNotificationCount({ enabled: open });
  const { data, isPending } = useNotifications({ enabled: open });
  const markAllRead = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();
  // Fix 8: a simple filter, and opening one marks it read.
  const [kind, setKind] = useState<NotificationKind | "all">("all");

  // 119: messages from the communication center sit above the list until dismissed.
  const { data: announcements } = useAnnouncements();
  const announcementReceipt = useAnnouncementReceipt();
  const messages = kind === "all" || kind === "account" ? (announcements ?? []) : [];
  const unseenMessages = (announcements ?? []).filter((a) => !a.seen).length;

  const unread = (liveUnread ?? initialUnreadCount) + unseenMessages;
  const all = data?.notifications ?? [];
  const notifications = kind === "all" ? all : all.filter((n) => notificationKind(n.event) === kind);
  const markOpened = (id: string, readAt: string | null) => {
    if (readAt === null) markRead.mutate({ id });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={notificationsLabel(unread)}
        className={cn(NAV_ICON_BUTTON, FOCUS_RING)}
      >
        <BellSimple size={22} weight="regular" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-[9px] right-[10px] h-2 w-2 rounded-full border-2 border-card bg-tm-coral"
          />
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-tm-border p-0"
      >
        <div className="flex items-center justify-between border-b border-tm-hairline px-4 py-3">
          <h2 className="font-display text-[15px] font-bold text-tm-ink">
            Notifications
          </h2>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className={cn(
                "rounded-sm text-xs font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              Mark all read
            </button>
          )}
        </div>
        <div role="tablist" aria-label="Filter notifications" className="flex gap-1 border-b border-tm-hairline px-3 py-2">
          {NOTIFICATION_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={kind === k.key}
              onClick={() => setKind(k.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] leading-none font-semibold transition-colors",
                kind === k.key ? "bg-tm-pill-bg text-tm-coral-strong" : "text-tm-text-2 hover:bg-tm-paper",
                FOCUS_RING,
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        {/*
          `overscroll-contain`, not the default `auto`. The list is the one
          scrollable box that sits ON TOP of a live page: flicking it to the end
          chains the rest of the gesture into the document, so the panel stays
          put while Home scrolls away underneath it. The installed app's
          `overscroll-behavior: none` on html/body (globals.css) does NOT cover
          this — that rule only stops the viewport's own rubber-band and
          pull-to-refresh; chaining INTO the viewport is the inner container's
          decision, and this is where it is made.
        */}
        <ul className="max-h-80 overflow-y-auto overscroll-contain">
          {isPending && (
            <li className="px-4 py-6 text-sm text-tm-text-3">Loading…</li>
          )}

          {messages.map((message) => (
            <li key={`announcement-${message.id}`} className="border-b border-tm-hairline bg-tm-pill-bg/40 px-4 py-3">
              <p className="text-[11px] leading-none font-bold text-tm-coral-strong">From Tomame</p>
              <p className="mt-1 text-[13px] leading-snug font-semibold text-tm-ink">
                {message.link_href ? (
                  <Link href={message.link_href} onClick={() => setOpen(false)} className={cn("rounded-sm hover:underline", FOCUS_RING)}>
                    {message.title}
                  </Link>
                ) : (
                  message.title
                )}
              </p>
              <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-tm-text-2">{message.body}</p>
              <p className="tm-nums mt-1 flex items-center gap-2 text-[11px] text-tm-text-3">
                {formatWhen(message.created_at)}
                <button
                  type="button"
                  onClick={() => announcementReceipt.mutate({ id: message.id, dismissed: true })}
                  className={cn("rounded-sm font-semibold text-tm-coral hover:text-tm-coral-strong", FOCUS_RING)}
                >
                  Dismiss
                </button>
              </p>
            </li>
          ))}

          {!isPending && notifications.length === 0 && messages.length === 0 && (
            <li className="px-4 py-6 text-sm text-tm-text-3">
              {kind === "all" ? <>Nothing yet. We&rsquo;ll tell you when a parcel moves.</> : "Nothing of this kind."}
            </li>
          )}

          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="border-b border-tm-hairline px-4 py-3 last:border-b-0"
            >
              <div className="flex items-start gap-2.5">
                {notification.read_at === null && (
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tm-coral"
                  />
                )}
                <div className={cn(notification.read_at !== null && "pl-4")}>
                  <p className="text-[13px] leading-snug font-semibold text-tm-ink">
                    {(() => {
                      const { href, title } = describeNotification(notification.event, notification.payload);
                      return href ? (
                        <Link
                          href={href}
                          onClick={() => {
                            markOpened(notification.id, notification.read_at);
                            setOpen(false);
                          }}
                          className={cn("rounded-sm hover:underline", FOCUS_RING)}
                        >
                          {title}
                        </Link>
                      ) : (
                        title
                      );
                    })()}
                  </p>
                  {(() => {
                    const { detail } = describeNotification(notification.event, notification.payload);
                    return detail ? <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-tm-text-2">{detail}</p> : null;
                  })()}
                  <p className="tm-nums mt-0.5 flex items-center gap-2 text-[11px] text-tm-text-3">
                    {formatWhen(notification.created_at)}
                    {notification.read_at === null ? (
                      <button
                        type="button"
                        onClick={() => markOpened(notification.id, notification.read_at)}
                        className={cn("rounded-sm font-semibold text-tm-coral hover:text-tm-coral-strong", FOCUS_RING)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Short, absolute and unambiguous — "12 Sep · 14:02". */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(", ", " · ");
}
