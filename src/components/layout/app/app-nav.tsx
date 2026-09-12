import Link from "next/link";

import { cn } from "@/lib/utils";
import { AppNavLinks } from "./app-nav-links";
import { APP_NAV_ITEMS, avatarInitial, formatRatePill } from "./links";
import { NotificationBell } from "./notification-bell";
import { FOCUS_RING } from "./styles";
import type { AppChromeData, AppNavItem } from "./types";

export interface AppNavProps extends AppChromeData {
  /** Override the destinations; defaults to the four in the design. */
  items?: readonly AppNavItem[];
  className?: string;
}

/**
 * The signed-in app nav — `design/TmNavLight.dc.html`.
 *
 * 76px tall on a 92%-white blurred ground with a hairline underline, laid out
 * as `1fr auto 1fr` so the pill group stays optically centred regardless of how
 * wide the right cluster grows.
 *
 * Server component: the parent resolves the session, the FX rate and the unread
 * count — this component never touches Supabase. Only the active-tab highlight
 * and the notification panel are client-side.
 *
 * **Two controls from the mock are deliberately absent.** The bag button with
 * its count badge needs a cart, which is Phase 4 — rendering a badge now would
 * mean inventing a number. The bookmark button is dropped because it goes to
 * the same place as the visible "Price watch" tab.
 */
export function AppNav({
  items = APP_NAV_ITEMS,
  isAuthenticated,
  firstName,
  unreadCount,
  rate,
  className,
}: AppNavProps) {
  const ratePill = rate
    ? formatRatePill(rate.base, rate.appliedRate)
    : null;
  const initial = avatarInitial(firstName);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-tm-border bg-card/92 backdrop-blur-[12px]",
        className,
      )}
    >
      {/*
        Not a <nav> landmark: at mobile the tab list inside is hidden and the
        bottom tab bar becomes the primary navigation. Labelling this element
        "Primary" too would expose two identically-named landmarks on the same
        page. `AppNavLinks` carries the landmark, and it is hidden below `lg`.
      */}
      <div
        className={cn(
          "mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto] items-center gap-6 px-5 md:h-[76px] md:px-8",
          // Three columns only when the centred pill group is actually present,
          // otherwise the right cluster would be pulled into the middle track.
          isAuthenticated && "lg:grid-cols-[1fr_auto_1fr]",
        )}
      >
        {/*
          `/app` is gated by src/proxy.ts, so for a signed-out visitor on the
          public quote routes the wordmark has to lead to the marketing home —
          otherwise clicking the logo bounces them to a login screen and loses
          the quote they were building.
        */}
        <Link
          href={isAuthenticated ? "/app" : "/"}
          aria-label="Tomame — home"
          className={cn(
            "tm-wordmark w-fit rounded-sm text-[22px] leading-none md:text-[26px]",
            FOCUS_RING,
          )}
        >
          Tomame
        </Link>

        {/*
          Same reasoning as the bottom tab bar: three of these four tabs are
          gated by `src/proxy.ts`, so a signed-out visitor on the public quote
          flow would be offered navigation that only leads to a login screen.
        */}
        {isAuthenticated && <AppNavLinks items={items} />}

        <div className="flex items-center justify-end gap-2">
          {/*
            The live rate, not a literal. Omitted entirely when the rate is
            unavailable — a stale or invented FX figure on the chrome of every
            page is worse than no chip.
          */}
          {ratePill && (
            <span
              className="hidden h-[38px] items-center gap-2 rounded-full border border-tm-border pr-3 pl-2.5 text-[13px] font-medium text-tm-text-2 md:inline-flex"
              title={
                rate?.fetchedAt
                  ? `Rate updated ${new Date(rate.fetchedAt).toLocaleString("en-GB")}`
                  : undefined
              }
            >
              <span
                aria-hidden
                className="relative inline-flex h-2 w-2 shrink-0"
              >
                <span className="tm-pulse-dot absolute inset-0 rounded-full bg-tm-green" />
                <span className="absolute inset-0 rounded-full bg-tm-green" />
              </span>
              <span className="tm-nums">{ratePill}</span>
            </span>
          )}

          {/*
            A signed-out visitor on the public quote routes has no notifications
            and no avatar initial, so they get a way in instead of a bell that
            can only ever be empty.
          */}
          {isAuthenticated ? (
            <>
              <NotificationBell initialUnreadCount={unreadCount} />

              <Link
                href="/app/account"
                aria-label="Your account"
                className={cn(
                  "ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--tm-gradient-avatar)] text-[13px] font-bold text-[#b93a22]",
                  FOCUS_RING,
                )}
              >
                {initial ?? (
                  <span aria-hidden className="text-base leading-none">
                    &bull;
                  </span>
                )}
              </Link>
            </>
          ) : (
            <Link
              href="/auth/login"
              className={cn(
                "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-tm-ink transition-colors duration-200 hover:bg-tm-tint",
                FOCUS_RING,
              )}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
