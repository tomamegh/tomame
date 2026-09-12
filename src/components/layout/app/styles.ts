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
 */
export const NAV_ICON_BUTTON =
  "relative inline-flex h-10 w-10 items-center justify-center rounded-full text-tm-ink transition-colors duration-200 hover:bg-tm-tint";
