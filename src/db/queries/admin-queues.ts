import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * "What is waiting for a person?" — one read for the admin chrome.
 *
 * The admin gained four queues that nothing counts: assisted requests (049),
 * contact messages (053), orders held for review (031) and pastes the extractor
 * gave up on (049). Each has a screen, and none of them announced itself, so an
 * admin had to open all four to discover that three were empty. These counts
 * drive the sidebar badges. Parcel feedback (054) is the fifth.
 *
 * COUNT-ONLY, head requests. Nothing here reads a row: the chrome needs a
 * number, and pulling five lists to measure their length on every admin page
 * load would be the expensive way to render a dot.
 *
 * Every count degrades to 0 on failure rather than throwing. A badge is
 * decoration on a page that has already rendered; a chrome query must never be
 * the thing that takes the admin down. A missing TABLE is the same case here —
 * unlike the customer surfaces, where `isSchemaMissingError` rethrows to make a
 * deploy-before-migrate loud, this runs on every admin route and the admin's own
 * migration screens are how you would fix it.
 */

export interface AdminQueueCounts {
  /** `assisted_requests` still `open` — nobody has picked the customer up. */
  assistedOpen: number;
  /** `contact_messages` still `open`. */
  contactOpen: number;
  /** Orders an admin has to price or approve before they can move. */
  ordersNeedingReview: number;
  /** Pastes the extractor gave up on — the customer is looking at a dead link. */
  pastesFailed: number;
  /**
   * `order_feedback` still `open` (054) — a customer has looked at the photo of
   * their parcel and said something about it while the box is still at a US hub.
   * The most time-sensitive of the five: every hour it sits there is an hour
   * closer to the parcel being in the air, where a mistake stops being cheap.
   *
   * CONFIRMATIONS ARE NOT COUNTED. A `looks_right` is an open row and someone
   * does eventually file it, but a badge here means "a person owes somebody an
   * action", and nobody owes anything on a customer saying their parcel is
   * correct. Counting them would light the same amber pip for good news as for a
   * wrong item — and since most customers who answer at all will answer
   * `looks_right`, the badge would rarely reach zero, which is the definition of
   * furniture rather than signal (see the note on `NavLink.badge`). They are
   * still in the queue, in their own section, where they read as the answer the
   * photo was taken for.
   */
  feedbackOpen: number;
  /**
   * Sourcing requests still `requested` (065) — a customer is holding an item
   * in their bag that they cannot pay for until somebody prices it by hand.
   * The most directly blocking of the lot: this badge is money that cannot be
   * taken until it clears.
   */
  sourcingOpen: number;
}

export const EMPTY_QUEUE_COUNTS: AdminQueueCounts = {
  assistedOpen: 0,
  contactOpen: 0,
  ordersNeedingReview: 0,
  pastesFailed: 0,
  feedbackOpen: 0,
  sourcingOpen: 0,
};

export async function getAdminQueueCounts(): Promise<AdminQueueCounts> {
  const db = createAdminClient();

  const [assistedOpen, contactOpen, ordersNeedingReview, pastesFailed, feedbackOpen, sourcingOpen] =
    await Promise.all([
      countWhere(db, "assisted_requests", (q) => q.eq("status", "open")),
      countWhere(db, "contact_messages", (q) => q.eq("status", "open")),
      countWhere(db, "orders", (q) => q.eq("needs_review", true)),
      // Only recent failures. A paste that failed three weeks ago is history, not
      // a queue — the customer has long since re-pasted it or given up, and
      // counting it forever would leave a badge burning that nobody can clear.
      countWhere(db, "extraction_requests", (q) =>
        q.eq("status", "failed").gt("updated_at", sevenDaysAgo()),
      ),
      // No age cut-off, unlike the pastes above: an open objection about a parcel
      // is not history a customer works around, it is a box nobody answered for.
      countWhere(db, "order_feedback", (q) =>
        q.eq("status", "open").neq("verdict", "looks_right"),
      ),
      // No age cut-off either, and for a stronger reason than the feedback above:
      // an unanswered sourcing request is a bag that cannot be checked out. It
      // does not become history, it just stays unpaid.
      countWhere(db, "price_watches", (q) =>
        q.eq("kind", "sourcing").eq("sourcing_status", "requested"),
      ),
    ]);

  return { assistedOpen, contactOpen, ordersNeedingReview, pastesFailed, feedbackOpen, sourcingOpen };
}

type CountQuery = {
  eq: (column: string, value: unknown) => CountQuery;
  neq: (column: string, value: unknown) => CountQuery;
  gt: (column: string, value: unknown) => CountQuery;
};

/** One `head: true` count, with its own failure absorbed. */
async function countWhere(
  db: ReturnType<typeof createAdminClient>,
  table: string,
  refine: (query: CountQuery) => CountQuery,
): Promise<number> {
  try {
    const base = db.from(table).select("id", { count: "exact", head: true });
    const { count, error } = await (refine(base as unknown as CountQuery) as unknown as typeof base);
    if (error) {
      logger.warn("admin queue count failed", { table, message: error.message });
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    logger.warn("admin queue count threw", {
      table,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

function sevenDaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}
