"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle } from "@phosphor-icons/react/ssr";

import { useMarkAllNotificationsRead } from "@/features/notifications/hooks/useNotifications";
import type { Notification } from "@/features/notifications/types";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { formatNotificationEvent, formatNotificationStamp, formatUnreadCount } from "../format";
import { useUpdateAccountProfile } from "../hooks/useAccountProfile";
import { accountTabHref } from "../tabs";
import { AccountEmpty, AccountPanel } from "./account-panel";
import { AccountToggle } from "./account-toggle";

export interface AccountNotificationsPanelProps {
  /** `notifications` rows for this account, newest first — the server's read. */
  notifications: Notification[];
  unreadCount: number;
  /** `profiles.notify_email` / `profiles.whatsapp_opt_in` (051). */
  preferences: { notify_email: boolean; whatsapp_opt_in: boolean };
  /** Whether `profiles.phone` holds anything — WhatsApp has nowhere to go without it. */
  hasPhone: boolean;
  blurb: string;
}

/**
 * Notifications — what we have sent, and where to send the next one.
 *
 * The two toggles write `profiles` through `PATCH /api/app/me`, because the
 * preferences are columns of the profile row (051). They are optimistic in the
 * narrow sense that the switch moves immediately and rolls back on failure:
 * the alternative is a control that appears dead for the length of a round trip.
 *
 * The WhatsApp toggle is DISABLED without a phone number rather than allowed to
 * fail — the server rejects that combination, and a switch that flicks on and
 * then silently back off is worse than one that says why it cannot move.
 */
export function AccountNotificationsPanel({
  notifications,
  unreadCount,
  preferences,
  hasPhone,
  blurb,
}: AccountNotificationsPanelProps) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(preferences);
  const { save, isPending } = useUpdateAccountProfile();
  const markAllRead = useMarkAllNotificationsRead();

  const setPreference = useCallback(
    (key: "notify_email" | "whatsapp_opt_in", next: boolean) => {
      const previous = prefs;
      setPrefs({ ...previous, [key]: next });
      save(
        { [key]: next },
        {
          onError: (error) => {
            setPrefs(previous);
            toast.error({ title: "Could not save that preference", description: error.message });
          },
        },
      );
    },
    [prefs, save],
  );

  const unreadLabel = formatUnreadCount(unreadCount);

  return (
    <AccountPanel
      title="Notifications"
      blurb={blurb}
      action={
        unreadCount > 0 ? (
          <button
            type="button"
            disabled={markAllRead.isPending}
            onClick={() =>
              markAllRead.mutate(undefined, {
                // The list and the count are server-rendered, so the fresh read
                // has to come from the server — invalidating the client cache
                // alone would leave the dots where they are.
                onSuccess: () => router.refresh(),
                onError: (error) =>
                  toast.error({ title: "Could not mark them read", description: error.message }),
              })
            }
            className="rounded-full border border-tm-border bg-tm-paper px-3.5 py-2 text-[13px] leading-none font-semibold transition-colors hover:border-tm-coral/40 hover:text-tm-coral-strong disabled:opacity-60"
          >
            Mark all read
          </button>
        ) : null
      }
    >
      {/* ── Where to send things ────────────────────────────────────────── */}
      <div className={cn("flex flex-col", isPending && "opacity-70")} aria-busy={isPending}>
        <h3 className="pb-1 text-[13px] leading-none font-semibold">How we reach you</h3>

        <AccountToggle
          id="notify-email"
          label="Email"
          description="Order confirmations, payment receipts and delivery updates, to the address you sign in with."
          checked={prefs.notify_email}
          onChange={(next) => setPreference("notify_email", next)}
        />

        <AccountToggle
          id="notify-whatsapp"
          label="WhatsApp"
          description="The same updates on WhatsApp, to the phone number on your profile."
          checked={prefs.whatsapp_opt_in}
          disabled={!hasPhone}
          disabledReason={
            <>
              Add a phone number on{" "}
              <Link href={accountTabHref("profile")} className="font-semibold underline underline-offset-2">
                Profile
              </Link>{" "}
              first — there is nowhere to send a message without one.
            </>
          }
          onChange={(next) => setPreference("whatsapp_opt_in", next)}
        />
      </div>

      {/*
        Said plainly because a customer who turns both off should know what that
        does and does not stop. Payment receipts are a record of money moving;
        they are not marketing and there is no switch that silences them.
      */}
      <p className="text-xs leading-[1.45] font-medium text-tm-text-3">
        We only send transactional messages — something happened to your order or
        your money. Turning a channel off stops the updates on it; anything we
        are legally required to send you still goes to your email.
      </p>

      {/* ── What has been sent ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] leading-none font-semibold">Recent notifications</h3>
          {unreadLabel ? (
            <span className="rounded-full bg-tm-tint px-2.5 py-1 text-[11px] leading-none font-bold text-tm-coral-strong">
              {unreadLabel}
            </span>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <AccountEmpty
            title="Nothing sent yet"
            body="Every message we send you shows up here — what it was about, which channel carried it, and whether it went out."
          />
        ) : (
          <ul className="flex flex-col">
            {notifications.map((item) => (
              <NotificationRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </AccountPanel>
  );
}

/**
 * One `notifications` row.
 *
 * `status` and `read_at` mean different things and both are shown: `status` is
 * whether WE managed to send it (`pending | sent | failed`), `read_at` is
 * whether the customer has opened it here. A failed row is worth seeing — it is
 * the explanation for an update that never arrived.
 */
function NotificationRow({ item }: { item: Notification }) {
  const unread = item.read_at === null;

  return (
    <li className="flex items-start gap-3 border-b border-tm-hairline py-3 last:border-b-0">
      {unread ? (
        <Circle weight="fill" className="mt-1 size-2.5 shrink-0 text-tm-coral" aria-label="Unread" />
      ) : (
        <CheckCircle weight="duotone" className="mt-0.5 size-4 shrink-0 text-tm-text-3" aria-label="Read" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("text-sm leading-none", unread ? "font-bold" : "font-semibold")}>
          {formatNotificationEvent(item.event)}
        </span>
        <span className="text-xs leading-none text-tm-text-3">
          {formatNotificationStamp(item.sent_at ?? item.created_at)} · {item.channel}
        </span>
      </div>

      {item.status !== "sent" ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] leading-none font-bold capitalize",
            item.status === "failed" ? "bg-tm-tint text-tm-coral-strong" : "bg-tm-amber-bg text-tm-amber",
          )}
        >
          {item.status}
        </span>
      ) : null}
    </li>
  );
}
