import "server-only";

import type { AppChromeData } from "@/components/layout/app/types";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { countUnreadNotifications } from "@/features/notifications/services/notifications.service";
import { getFxRateQuote } from "@/features/pricing/services/fx-rate.service";
import { getBagCount } from "@/features/bag/services/bag.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { cookies } from "next/headers";
import { logger } from "@/lib/logger";

/**
 * Everything the signed-in chrome renders, resolved once per request.
 *
 * The nav is presentational by design — the layout calls this and passes the
 * result down, so no chrome component ever touches Supabase.
 *
 * The reads are independent and run together. Each degrades on its own:
 * a missing FX rate hides the pill, a failed notification count shows no dot.
 * Neither is worth failing a page render over. A **missing table** is different
 * and rethrows, so a deploy that runs ahead of its migrations produces a loud
 * error rather than a silently empty shell (handoff gotcha 8).
 */
export async function getAppChrome(): Promise<AppChromeData> {
  const user = await getAuthenticatedUser();
  const cookieStore = await cookies();
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };

  const [unreadCount, rate, bagCount] = await Promise.all([
    // Signed-out visitors reach this layout on the public quote routes
    // (`/app/orders/new`, `/app/orders/review`), where there is no one to have
    // notifications. Skip the query rather than letting it 401.
    user
      ? countUnreadNotifications(user).catch((error: unknown) => {
          rethrowIfSchemaMissing(error);
          logger.warn("App chrome: unread notification count unavailable", {
            error: String(error),
          });
          return 0;
        })
      : Promise.resolve(0),
    // The rate loads for everyone: it is public data, and the quote flow is the
    // one place a signed-out visitor most needs to see what a dollar costs.
    getFxRateQuote("USD")
      .then((quote) => ({
        base: quote.base,
        appliedRate: quote.applied_rate,
        fetchedAt: quote.fetched_at,
      }))
      .catch((error: unknown) => {
        rethrowIfSchemaMissing(error);
        // Deliberately `info`, not `warn`: a 503 here is the ordinary "no rate
        // stored yet" case (the rate cron has not run in this environment), it
        // is already handled by hiding the pill, and this path runs on every
        // render of every /app page — at warn level it would bury real faults.
        logger.info("App chrome: FX rate unavailable, hiding the pill", {
          error: String(error),
        });
        return null;
      }),
    // The bag is public like the quote flow: a signed-out visitor's count comes
    // from the quote-session cookie. A failed count shows an empty tote, never
    // an invented number.
    getBagCount(viewer).catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      logger.warn("App chrome: bag count unavailable", { error: String(error) });
      return 0;
    }),
  ]);

  return {
    isAuthenticated: user != null,
    firstName: user?.profile?.first_name ?? null,
    unreadCount,
    rate,
    bagCount,
  };
}

/** Soft-fallback guard: let a missing relation through, swallow everything else. */
function rethrowIfSchemaMissing(error: unknown): void {
  if (isSchemaMissingError(error)) throw error;
}
