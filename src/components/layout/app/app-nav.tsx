import Link from "next/link";

import { cn } from "@/lib/utils";
import { Gauge } from "@phosphor-icons/react/ssr";

import { Logo } from "@/components/brand/logo";
import { AppNavLinks } from "./app-nav-links";
import { APP_NAV_ITEMS, avatarInitial, formatRatePill } from "./links";
import { BagButton } from "./bag-button";
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
 * **One control from the mock is deliberately absent.** The bookmark button is
 * dropped because it goes to the same place as the visible "Price watch" tab.
 * The bag tote renders for everyone — the bag is public like the quote flow —
 * with the real `cart_items` sum from migration 048.
 */
export function AppNav({
  items = APP_NAV_ITEMS,
  isAuthenticated,
  firstName,
  unreadCount,
  rate,
  bagCount,
  isAdmin,
  className,
}: AppNavProps) {
  const ratePill = rate
    ? formatRatePill(rate.base, rate.appliedRate)
    : null;
  const initial = avatarInitial(firstName);

  return (
    <header
      className={cn(
        // `tm-safe-top` is a no-op in a browser and reserves the notch inset in
        // the installed app, where the status bar is translucent and would
        // otherwise sit on top of the logo. See globals.css.
        "tm-safe-top sticky top-0 z-50 border-b border-tm-border bg-card/92 backdrop-blur-[12px]",
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
          aria-label="Tomame home"
          className={cn("w-fit rounded-sm", FOCUS_RING)}
        >
          {/*
            The REAL logo, not gradient-styled text. This was `tm-wordmark` on
            the literal word "Tomame" — the brand mark was simply absent from
            every signed-in screen while the marketing site carried it. `Logo`
            is the one place the artwork lives (`components/brand/logo.tsx`);
            `priority` because this is above the fold on every app route.
          */}
          {/*
            Two spellings, one per breakpoint. At 390px the full lockup plus the
            right cluster (bag, bell, avatar — or bag and "Sign in") did not fit:
            the bag's badge sat on top of the wordmark's last letter in Kelvin's
            screenshot. The mark alone below `md` gives the row back ~130px; the
            wordmark returns from `md` up. The mark is the same file in both, so
            the phone downloads nothing extra.
          */}
          <Logo variant="mark" height={34} decorative priority className="md:hidden" />
          <Logo variant="horizontal" height={24} decorative priority className="hidden md:inline-flex" />
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
          <BagButton count={bagCount} />

          {isAuthenticated ? (
            <>
              {/*
                The way back. An admin is met with the admin view on sign-in and
                switches out to the storefront on purpose — without this the
                switch is one-way and the only route back is retyping `/admin`.
                Hidden below `md`: the admin is not usable on a phone, so
                offering it there would lead somewhere unworkable.
              */}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={cn(
                    "hidden h-9 items-center gap-1.5 rounded-full border border-tm-border px-3 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-tint hover:text-tm-ink md:inline-flex",
                    FOCUS_RING,
                  )}
                >
                  <Gauge weight="duotone" className="size-4 shrink-0" aria-hidden />
                  Admin
                </Link>
              )}

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
