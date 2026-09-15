/**
 * Shared class fragments for the signed-in app chrome.
 *
 * Focus rings are the one thing the 1280px mocks cannot show, so they are
 * defined once here and reused by every interactive element in the nav and the
 * bottom tab bar. Mirrors `src/components/layout/marketing/styles.ts`.
 */
export const FOCUS_RING =
  "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30 focus-visible:ring-offset-1 focus-visible:ring-offset-card";

/**
 * The 40px circular icon button in the nav's right cluster —
 * `design/TmNavLight.dc.html`.
 *
 * `shrink-0` is not decoration. The right cluster is a flex row sitting in a
 * grid track that the centred tab group regularly starves (the long note on the
 * rate pill in `app-nav.tsx` has the arithmetic), and without it the shortfall
 * was paid out of these buttons: at 1024px the tote measured 34.9 x 40 — a
 * visible oval with its glyph off centre, and the bell beside it the same. A
 * circle that is only circular at some window widths is a bug, so the buttons
 * hold their size and the pill is the thing that stands down.
 */
export const NAV_ICON_BUTTON =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-tm-ink transition-colors duration-200 hover:bg-tm-tint";

/**
 * Bottom padding the app shell's <main> needs below `lg` so the last card
 * clears the FIXED tab bar: a named utility in globals.css (`tm-clear-tab-bar`)
 * whose value is the bar's height plus the home-indicator inset, with its own
 * `lg` reset.
 *
 * IT LIVES HERE, IN A MODULE WITH NO "use client", AND THAT IS LOAD-BEARING.
 * It was first exported from app-bottom-tabs.tsx, which is a client component.
 * A server component that imports a non-component export from a client module
 * does not receive the value -- Next substitutes a client-reference object -- and
 * clsx/cn() silently drops an object it cannot read as a class map. <main>
 * rendered with NO bottom padding on every signed-in page, the last card sat
 * behind the tab bar with nothing left to scroll, and it looked exactly like
 * the CSS was wrong when the CSS was fine (Kelvin: "I am at the end and is
 * still not scrollable"). Constants shared with server components must come
 * from a file like this one.
 */
export const APP_BOTTOM_TABS_PADDING = "tm-clear-tab-bar";
