import "server-only";

import { repriceUnpaidOrders } from "@/features/orders/services/order-reprice.service";
import { logger } from "@/lib/logger";
import { CACHE_TAGS, expireCacheTag } from "@/lib/shared-cache";

/**
 * What follows an admin pricing write (groups, category map, fixed freight,
 * constants, the Excel import).
 *
 * Now: the shared display reads (shop cards, shelves, the nav pill) expire, so
 * they stop trailing the change by their TTL. Quotes, bag lines and order
 * intake read the tables fresh and need nothing.
 *
 * Returned for `after()`: checked-out, unpaid orders are re-priced to the new
 * figures (order-reprice.service.ts). The `reprice-unpaid-orders` cron (096)
 * repeats it, for a run that is lost and for orders whose payment was open.
 */
export function pricingChanged(ctx: { actorId: string; reason: string }): () => Promise<void> {
  expireCacheTag(CACHE_TAGS.pricingDisplay);
  expireCacheTag(CACHE_TAGS.catalog);
  return async () => {
    try {
      await repriceUnpaidOrders(ctx);
    } catch (error) {
      logger.error("re-pricing unpaid orders after a pricing change failed", {
        reason: ctx.reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
