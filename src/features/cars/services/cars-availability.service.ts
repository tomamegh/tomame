import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { hasPublishedCarListing } from "@/db/queries/cars";
import { logger } from "@/lib/logger";

/**
 * Whether the Cars tab exists at all.
 *
 * The owner's rule: cars get their own tab in the top navigation, and it
 * appears once something is published. With nothing on the water there is no
 * tab and no link to an empty shelf. `/app/cars` itself still renders, with its
 * own honest empty state, for anyone holding the URL.
 *
 * CACHED, BECAUSE THE NAV RENDERS ON EVERY PAGE. The answer is the same for
 * every viewer (it is a fact about the catalogue, not about who is looking), so
 * it lives in the Next data cache under one tag for five minutes. Every admin
 * write that can change it — create, edit, publish/unpublish, delete — calls
 * `invalidatePublishedCars()`, so the tab follows a publish on the next request
 * rather than up to five minutes later. The TTL is only the backstop for a
 * write that bypassed the service (a SQL edit on the table).
 *
 * A FAILED READ HIDES THE TAB. The nav is not worth failing a page over, and
 * "no tab" is the state that can never lead anywhere wrong.
 */

export const PUBLISHED_CARS_TAG = "cars:published";

/** Five minutes: the backstop, not the freshness mechanism. */
const PUBLISHED_CARS_TTL_SECONDS = 300;

const readPublishedCars = unstable_cache(
  () => hasPublishedCarListing(),
  ["cars-has-published"],
  { tags: [PUBLISHED_CARS_TAG], revalidate: PUBLISHED_CARS_TTL_SECONDS },
);

export async function hasPublishedCars(): Promise<boolean> {
  try {
    return await readPublishedCars();
  } catch (error) {
    logger.warn("Cars tab: published check unavailable, hiding the tab", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Expire the cached answer immediately after a listing write.
 *
 * `{ expire: 0 }` rather than the `"max"` stale-while-revalidate profile: with
 * SWR the first page after an unpublish would still carry the tab. Swallowed on
 * failure — the write has already succeeded and been audited, and the TTL above
 * bounds how long a missed invalidation can last.
 */
export function invalidatePublishedCars(): void {
  try {
    revalidateTag(PUBLISHED_CARS_TAG, { expire: 0 });
  } catch (error) {
    logger.warn("Cars tab: could not invalidate the published check", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
