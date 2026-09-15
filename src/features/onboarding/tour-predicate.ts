/**
 * The one decision this feature must never get wrong: should the four-stop
 * tour start for this viewer, on this render?
 *
 * Pure and framework-free on purpose, so it can be exhaustively unit tested
 * without a DOM, a router or a Supabase client. Every input is a plain value
 * the caller already has: `src/app/app/layout.tsx` resolves the profile row
 * server-side, and the client controller supplies the route and query string
 * via `usePathname()` / `useSearchParams()`.
 *
 * WHETHER SOMEBODY HAS ORDERED IS NOT AN INPUT, and used to be. The first cut
 * refused the tour to any customer with a row in `orders`, on the theory that
 * they already know the product. Kelvin caught it: what somebody has bought is
 * not evidence of what they have been shown. Every account on production has
 * orders, so that rule meant the tour could never appear for a single existing
 * customer, including the owner. The two persisted stamps below are the only
 * record of "this person has seen it", and they are the only thing that
 * decides. The remaining rules are not about eligibility at all; they are
 * about not interrupting somebody in the middle of something.
 *
 * This function decides whether to START the tour. It is not consulted again
 * once the tour is running — the tour's own step machine deliberately
 * navigates to `/app/bag` for stop 3, which this same predicate would refuse
 * to START on, and that refusal must not cancel a tour already in progress.
 */

export interface OnboardingTourViewer {
  /**
   * `site_settings.onboarding_tour_enabled` (066). The admin's switch, and the
   * first thing checked: when it is off nobody new is shown the tour, whatever
   * else is true of them.
   */
  tourEnabled: boolean;
  /** Signed-out visitors never see the tour — the quote flow is public by design. */
  isAuthenticated: boolean;
  /** From `usePathname()`. Null (no route resolved yet) never fires. */
  pathname: string | null;
  /**
   * True when the current URL is a checkout return — Paystack sends a settled
   * or failed payment back with `?payment=...` on `/app/orders` (and
   * `/app/bag`, for a declined attempt). That instant is a customer's most
   * impatient moment and the worst time to interrupt them with a tour.
   */
  hasPaymentReturnParam: boolean;
  /** `profiles.onboarding_completed_at`. Any non-null value means "never again". */
  onboardingCompletedAt: string | Date | null;
  /** `profiles.onboarding_dismissed_at`. Any non-null value means "never again". */
  onboardingDismissedAt: string | Date | null;
}

/** `/app/bag` and everything under it — the bag has its own pay flow and is never the first thing a new customer sees. */
function isBagRoute(pathname: string): boolean {
  const normalised = stripTrailingSlash(pathname);
  return normalised === "/app/bag" || normalised.startsWith("/app/bag/");
}

/** The tour only ever runs inside the signed-in app shell. */
function isAppRoute(pathname: string): boolean {
  const normalised = stripTrailingSlash(pathname);
  return normalised === "/app" || normalised.startsWith("/app/");
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * Should the tour start for this viewer, on this render?
 *
 * Every rule below is a reason to say no; the tour starts only when none of
 * them fire. Order does not matter for correctness (every check is
 * independent), but signed-out is checked first since it makes every other
 * field meaningless.
 */
export function shouldShowOnboardingTour(viewer: OnboardingTourViewer): boolean {
  if (!viewer.tourEnabled) return false;
  if (!viewer.isAuthenticated) return false;
  if (!viewer.pathname) return false;
  if (!isAppRoute(viewer.pathname)) return false;
  if (isBagRoute(viewer.pathname)) return false;
  if (viewer.hasPaymentReturnParam) return false;
  if (viewer.onboardingCompletedAt) return false;
  if (viewer.onboardingDismissedAt) return false;
  return true;
}
