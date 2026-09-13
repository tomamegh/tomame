/**
 * The six destinations of the account screen's left rail.
 *
 * Pure and framework-free so the resolver can be unit tested without a DOM,
 * exactly as `src/components/layout/app/links.ts` is for the nav.
 *
 * The tab lives in the URL (`/app/account?tab=addresses`) rather than in client
 * state, for three reasons: each panel then loads only its own data on the
 * server instead of the page fetching six sources for one visible panel; a tab
 * can be linked to (a notification about a price drop can point straight at
 * Price watch); and the browser's back button behaves the way the customer
 * expects.
 */

export const ACCOUNT_TAB_KEYS = [
  "profile",
  "addresses",
  "payment",
  "watch",
  "notifications",
  "security",
] as const;

export type AccountTabKey = (typeof ACCOUNT_TAB_KEYS)[number];

/** The rail's icon, named rather than imported — see `accountTabIcon`. */
export type AccountTabIcon =
  | "user"
  | "map-pin"
  | "credit-card"
  | "bookmark"
  | "bell"
  | "shield";

export interface AccountTab {
  key: AccountTabKey;
  label: string;
  /** The 390px rail is a scrolling pill row; two of the labels are too long for it. */
  shortLabel: string;
  icon: AccountTabIcon;
  /** One line under the panel heading. What this tab is FOR, not what it contains. */
  blurb: string;
}

export const ACCOUNT_TABS: readonly AccountTab[] = [
  {
    key: "profile",
    label: "Profile",
    shortLabel: "Profile",
    icon: "user",
    blurb: "Your name, how we reach you, and the address you signed in with.",
  },
  {
    key: "addresses",
    label: "Addresses",
    shortLabel: "Addresses",
    icon: "map-pin",
    blurb: "Where a courier knocks, and who they ask for.",
  },
  {
    key: "payment",
    label: "Payment",
    shortLabel: "Payment",
    icon: "credit-card",
    blurb: "What you have paid, and how payment works here.",
  },
  {
    key: "watch",
    label: "Price watch",
    shortLabel: "Watch",
    icon: "bookmark",
    blurb: "Links we re-check once a day, landed in GH₵.",
  },
  {
    key: "notifications",
    label: "Notifications",
    shortLabel: "Alerts",
    icon: "bell",
    blurb: "What we have sent you, and where to send the next one.",
  },
  {
    key: "security",
    label: "Security",
    shortLabel: "Security",
    icon: "shield",
    blurb: "Your password and this account's sign-in record.",
  },
] as const;

/**
 * The tab a `?tab=` value names, falling back to Profile.
 *
 * A query string is user input: an unknown, empty or repeated value must land
 * somewhere sensible rather than rendering an empty panel. Next gives repeated
 * params as an array, so that case is narrowed here instead of at every call
 * site.
 */
export function resolveAccountTab(
  raw: string | string[] | undefined,
): AccountTabKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = ACCOUNT_TAB_KEYS.find((key) => key === value);
  return match ?? "profile";
}

/** `/app/account?tab=addresses` — Profile is the bare route, not `?tab=profile`. */
export function accountTabHref(key: AccountTabKey): string {
  return key === "profile" ? "/app/account" : `/app/account?tab=${key}`;
}

/** The tab record for a key. Total by construction — every key has one entry. */
export function accountTab(key: AccountTabKey): AccountTab {
  const found = ACCOUNT_TABS.find((tab) => tab.key === key);
  // `ACCOUNT_TABS` is built from `ACCOUNT_TAB_KEYS`, so this cannot miss; the
  // fallback exists only so the return type needs no assertion.
  return found ?? ACCOUNT_TABS[0]!;
}
