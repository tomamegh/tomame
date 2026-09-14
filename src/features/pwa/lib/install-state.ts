/**
 * The decisions behind the install prompt, as pure functions.
 *
 * They live apart from the component because every one of them is a rule with
 * an edge case worth a test — "is this already installed", "is this a browser
 * that will never fire `beforeinstallprompt`", "has this person said no
 * recently enough that asking again is nagging" — and none of them needs a DOM
 * to be worth checking.
 */

/** How long a dismissal is honoured before the prompt may reappear. */
export const INSTALL_DISMISSAL_DAYS = 14;

/** localStorage key holding the epoch-ms of the last dismissal, or "installed". */
export const INSTALL_DISMISSED_KEY = "tm.install-prompt.dismissed";

/** Written instead of a timestamp once the app is actually installed. */
export const INSTALL_DISMISSED_FOREVER = "installed";

/**
 * True when the page is running as an installed app rather than in a browser
 * tab.
 *
 * Two checks, because the two platforms disagree: everyone else reports
 * `display-mode`, while iOS Safari has carried the non-standard
 * `navigator.standalone` since long before it supported the media query, and
 * still sets it.
 */
export function isStandalone(win: Window | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!win) return false;
  const byDisplayMode =
    typeof win.matchMedia === "function" &&
    ["standalone", "fullscreen", "minimal-ui"].some(
      (mode) => win.matchMedia(`(display-mode: ${mode})`).matches,
    );
  const iosLegacy = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return byDisplayMode || iosLegacy;
}

/**
 * True only on a phone or tablet.
 *
 * Tomame's installed app is a phone app: the shell is built around a bottom tab
 * bar that is hidden from `lg` up, and the launch screen is portrait. Offering
 * "Install Tomame" to someone on a desktop browser would install a window that
 * renders the wide layout with none of the reasons to have installed it, so the
 * prompt simply never appears there.
 *
 * Both halves are needed. Width alone would offer the install to anyone with a
 * narrow desktop window; a coarse pointer alone would offer it to a
 * touchscreen laptop. Together they mean "a device you hold".
 */
export function isMobileInstallContext(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!win || typeof win.matchMedia !== "function") return false;
  return (
    win.matchMedia("(pointer: coarse)").matches &&
    win.matchMedia("(max-width: 1024px)").matches
  );
}

/**
 * True for a browser on iOS or iPadOS that can install to the home screen but
 * will never fire `beforeinstallprompt` — Apple has not implemented that event
 * in any browser on the platform, including Chrome and Edge, because they are
 * all WebKit underneath. These users get written instructions instead.
 *
 * iPadOS is the awkward one: since iPadOS 13 it reports itself as "Macintosh",
 * so the touch-point count is what separates an iPad from a desktop Mac.
 */
export function isIosInstallCapable(
  userAgent: string,
  maxTouchPoints: number,
): boolean {
  const isIPhoneOrIPod = /iphone|ipod/i.test(userAgent);
  const isIPadClassic = /ipad/i.test(userAgent);
  const isIPadDesktopClass = /macintosh/i.test(userAgent) && maxTouchPoints > 1;
  return isIPhoneOrIPod || isIPadClassic || isIPadDesktopClass;
}

/**
 * Whether a stored dismissal still silences the prompt.
 *
 * Anything unparseable counts as "not dismissed" — a corrupt value should mean
 * one more prompt, never a prompt that can never appear again.
 */
export function isDismissalActive(
  stored: string | null,
  now: number,
  days: number = INSTALL_DISMISSAL_DAYS,
): boolean {
  if (!stored) return false;
  if (stored === INSTALL_DISMISSED_FOREVER) return true;

  const at = Number(stored);
  if (!Number.isFinite(at) || at <= 0) return false;
  // A timestamp in the future is a clock that has been wound back; honour it
  // rather than treating it as expired, or the prompt returns every launch.
  if (at > now) return true;

  return now - at < days * 24 * 60 * 60 * 1000;
}

/**
 * Routes where "Install Tomame" must not appear, however well-timed it is.
 *
 * All of them are moments where the customer is mid-task and an unexpected card
 * sliding over the bottom of the screen is at best a distraction and at worst a
 * mis-tap: signing in, reviewing a quote, or paying. The marketing pages are
 * deliberately NOT on this list — someone reading the pitch on their phone is
 * exactly who should be offered the app.
 */
const UNPROMPTABLE_PREFIXES = [
  "/auth",
  "/admin",
  "/app/bag",
  "/app/orders/review",
];

export function isPromptableRoute(pathname: string): boolean {
  return !UNPROMPTABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
