/**
 * Pure link/label helpers for the signed-in app chrome.
 *
 * Side-effect free and framework free so it can be unit tested without a DOM.
 * The nav and the bottom tab bar only render what these return.
 */

import type { AppNavItem, AppNavKey } from "./types";

/**
 * The four app destinations, in the order `design/TmNavLight.dc.html` shows
 * them. Mobile labels come from the 390px bottom tab bar in `v2-mobile`, which
 * shortens two of the four.
 *
 * `/app/watches` is new in Phase 2: the mock's Price watch tab previously had
 * no route to point at.
 */
export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  {
    key: "home",
    label: "Home",
    mobileLabel: "Home",
    href: "/app",
    icon: "house",
    exact: true,
  },
  {
    key: "shop",
    label: "Buy for me",
    mobileLabel: "Buy",
    href: "/app/orders/new",
    icon: "storefront",
  },
  {
    key: "ship",
    label: "Price watch",
    mobileLabel: "Watch",
    href: "/app/watches",
    icon: "bookmark",
  },
  {
    key: "orders",
    label: "Journeys",
    mobileLabel: "Journeys",
    href: "/app/orders",
    icon: "path",
  },
] as const;

/**
 * Which tab the current route belongs to, or `null` for an app route with no
 * tab of its own (`/app/account`, `/app/transactions`).
 *
 * **Most specific href wins.** Two of the four destinations overlap by prefix:
 * "Buy for me" is `/app/orders/new`, which sits underneath "Journeys"
 * (`/app/orders`). A naive first-match-wins scan highlights Journeys while the
 * customer is on the Buy screen, so candidates are ranked by href length before
 * the first match is taken.
 *
 * Home is `exact` because `/app` is a prefix of every other app route: without
 * that flag, `/app/account` and `/app/transactions` — which have no tab of
 * their own — would light up the Home tab.
 */
export function resolveActiveAppNavKey(
  pathname: string | null,
  items: readonly AppNavItem[] = APP_NAV_ITEMS,
): AppNavKey | null {
  if (!pathname) return null;

  const normalised = stripTrailingSlash(pathname);

  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) =>
      item.exact
        ? normalised === item.href
        : normalised === item.href ||
          normalised.startsWith(`${item.href}/`),
    );

  return match?.key ?? null;
}

/**
 * Routes whose 390px view pins its OWN action bar to the bottom edge.
 *
 * `/app/orders/review` is the landed-price screen: artboard 2 of `v2-mobile`
 * replaces the tab bar there with a watch button and "Continue to payment",
 * because two stacked bars would eat 180px of an 844px phone and put the
 * screen's own primary action in the middle of it. The screen carries a back
 * button to Home in its place.
 */
const MOBILE_ACTION_BAR_ROUTES = ["/app/orders/review"] as const;

/**
 * True when the current route renders its own bottom bar and the tab bar must
 * stand down. Prefix-matched: every quote id lives under the same route.
 */
export function ownsMobileBottomBar(pathname: string | null): boolean {
  if (!pathname) return false;
  const normalised = stripTrailingSlash(pathname);
  return MOBILE_ACTION_BAR_ROUTES.some(
    (route) => normalised === route || normalised.startsWith(`${route}/`),
  );
}

/** `/app/orders/` and `/app/orders` are the same destination. */
function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * "Morning" / "Afternoon" / "Evening" for the Home greeting chip.
 *
 * The hour is always passed in — never read from the clock here — so the
 * greeting is testable and so a server render and the client hydration cannot
 * disagree about the time of day.
 */
export function greetingForHour(hour: number): string {
  if (!Number.isFinite(hour)) return "Hello";
  const h = Math.floor(hour);
  if (h < 0 || h > 23) return "Hello";
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

/**
 * "Afternoon, Kwame" — or plain "Afternoon" when we have no name, rather than
 * greeting someone as "there".
 */
export function formatGreeting(
  hour: number,
  firstName: string | null,
): string {
  const greeting = greetingForHour(hour);
  const name = firstName?.trim();
  return name ? `${greeting}, ${name}` : greeting;
}

/**
 * "2 parcels moving", "1 parcel moving", or `null` at zero so the greeting chip
 * drops the clause entirely instead of announcing "0 parcels moving".
 */
export function formatMovingParcels(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const n = Math.floor(count);
  return `${n} ${n === 1 ? "parcel" : "parcels"} moving`;
}

/**
 * The avatar's single letter. Falls back to `null` when there is no usable
 * name, so the caller can render a generic glyph instead of a stray character.
 *
 * Uses the code-point, not `[0]`, so a name starting with an astral character
 * is not sliced into half a surrogate pair.
 */
export function avatarInitial(firstName: string | null): string | null {
  const name = firstName?.trim();
  if (!name) return null;
  return [...name][0]?.toUpperCase() ?? null;
}

/**
 * "$1 = GH₵14.43" for the nav pill.
 *
 * Two decimals, matching the mock. Returns `null` for a missing or nonsensical
 * rate so the pill is omitted rather than showing "$1 = GH₵0.00".
 */
export function formatRatePill(
  base: string,
  appliedRate: number | null,
): string | null {
  if (appliedRate === null || !Number.isFinite(appliedRate)) return null;
  if (appliedRate <= 0) return null;

  const symbol = CURRENCY_SYMBOLS[base.toUpperCase()] ?? `1 ${base} =`;
  const amount = appliedRate.toFixed(2);

  return symbol.endsWith("=")
    ? `${symbol} GH₵${amount}`
    : `${symbol}1 = GH₵${amount}`;
}

/** Only the currencies `RATE_CURRENCIES` supports need a symbol. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  CNY: "¥",
};

/**
 * The bell's accessible label. The unread count is announced rather than left
 * as a bare coloured dot, which is invisible to a screen reader.
 */
export function notificationsLabel(unreadCount: number): string {
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) {
    return "Notifications";
  }
  const n = Math.floor(unreadCount);
  return `Notifications, ${n} unread`;
}

/** Accessible name for the nav tote: "Bag" or "Bag, 3 items". */
export function bagLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "Bag";
  const n = Math.floor(count);
  return `Bag, ${n} item${n === 1 ? "" : "s"}`;
}
