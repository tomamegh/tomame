"use client";

import { BellSimple } from "@phosphor-icons/react";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useMarkAllNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/features/notifications/hooks/useNotifications";
import { cn } from "@/lib/utils";
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

  const unread = liveUnread ?? initialUnreadCount;
  const notifications = data?.notifications ?? [];

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

        <ul className="max-h-80 overflow-y-auto">
          {isPending && (
            <li className="px-4 py-6 text-sm text-tm-text-3">Loading…</li>
          )}

          {!isPending && notifications.length === 0 && (
            <li className="px-4 py-6 text-sm text-tm-text-3">
              Nothing yet. We&rsquo;ll tell you when a parcel moves.
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
                    {notificationTitle(notification.event)}
                  </p>
                  <p className="tm-nums mt-0.5 text-[11px] text-tm-text-3">
                    {formatWhen(notification.created_at)}
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

/**
 * `notifications.event` is a machine slug. Only two are ever written today
 * (`order_placed`, `order_placed_admin`); the data map notes the vocabulary has
 * to grow — price-drop, status-change, box-closing — before the bell earns its
 * place. Anything unmapped is humanised rather than shown raw or dropped.
 */
function notificationTitle(event: string): string {
  const known: Record<string, string> = {
    order_placed: "Order placed",
  };
  if (known[event]) return known[event];
  const words = event.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
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
