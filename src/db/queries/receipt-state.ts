import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { OrderPricingBreakdown, OrderStatus } from "@/features/orders/types";

/**
 * What has already become of the product on the Live receipt?
 *
 * THE BUG THIS EXISTS TO FIX. The Home receipt is "the last link you pasted",
 * resolved from `extraction_requests` alone. It knew nothing about what happened
 * to that product afterwards, so after a customer had **paid** for the item it
 * still showed them an "Add to bag" button for the thing they had just bought —
 * and it showed a freshly re-derived quote rather than the cedi total they were
 * actually charged. Kelvin found both: "I have paid for a product, it shows on
 * the live receipt as expected but now I am being asked to add to bag again.
 * Why, what's the essence. And why are we not converting it straight to cedis
 * and keeping it".
 *
 * So the receipt now asks two more questions about the same extraction: is there
 * an ORDER for it, and is it sitting in the open BAG? An order wins — it is the
 * settled fact, and its stored `pricing` is the price that was actually charged,
 * not a quote that drifts with the exchange rate every time Home is rendered.
 *
 * SERVICE ROLE WITH AN EXPLICIT OWNER FILTER, the same rule the rest of the
 * quote flow follows: a signed-out viewer is identified by the
 * `tm_quote_session` cookie, which PostgREST knows nothing about, so the filter
 * IS the authorization. Never drop it — without it this would report another
 * customer's order against your receipt.
 */

/** An order counts as paid from the moment money settled, whatever it is doing since. */
const PAID_STATUSES: readonly OrderStatus[] = [
  "paid",
  "processing",
  "in_transit",
  "delivered",
  "completed",
];

export type ReceiptFulfilment =
  /** Nothing has been done with it — the receipt offers the bag, as before. */
  | { kind: "none" }
  /** Already in the open bag. Offering "Add to bag" again would make a second line. */
  | { kind: "in_bag"; quantity: number }
  /** There is an order. This is the settled fact and it outranks the bag. */
  | {
      kind: "ordered";
      orderId: string;
      status: OrderStatus;
      /** Money has settled. False while the order is still `pending`. */
      paid: boolean;
      /**
       * The GH₵ actually charged — `admin_total_ghs` when an admin priced it by
       * hand (migration 031 makes that take precedence), else the order's own
       * stored `pricing.total_ghs`. Never a re-derived figure.
       */
      totalGhs: number | null;
      /** The order's stored breakdown: what the customer paid, line by line. */
      pricing: OrderPricingBreakdown | null;
      orderedAt: string;
    };

export const NO_FULFILMENT: ReceiptFulfilment = { kind: "none" };

interface Viewer {
  userId: string | null;
  sessionId: string | null;
}

/**
 * Resolve the receipt's downstream state for one extraction.
 *
 * Degrades to `{ kind: "none" }` on any failure rather than throwing: the
 * receipt has already rendered its price by the time this is asked, and the
 * cost of a miss is one redundant "Add to bag" — the cost of throwing is a Home
 * screen that will not load.
 */
export async function getReceiptFulfilment(
  viewer: Viewer,
  extractionCacheId: string | null,
): Promise<ReceiptFulfilment> {
  if (!extractionCacheId) return NO_FULFILMENT;

  const db = createAdminClient();

  try {
    // An order outranks a bag line, so it is asked first and answered alone.
    // Only a signed-in customer can have one: `orders.user_id` is NOT NULL.
    if (viewer.userId) {
      const { data, error } = await db
        .from("orders")
        .select("id, status, pricing, admin_total_ghs, created_at")
        .eq("user_id", viewer.userId)
        .eq("extraction_cache_id", extractionCacheId)
        // A cancelled order is not a fact about this product any more — the
        // customer may legitimately want to buy it again, so it must not
        // suppress the bag button.
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.warn("receipt fulfilment: order lookup failed", { message: error.message });
      } else if (data) {
        const row = data as {
          id: string;
          status: OrderStatus;
          pricing: OrderPricingBreakdown | null;
          admin_total_ghs: number | string | null;
          created_at: string;
        };
        return {
          kind: "ordered",
          orderId: row.id,
          status: row.status,
          paid: PAID_STATUSES.includes(row.status),
          totalGhs: settledTotal(row.admin_total_ghs, row.pricing),
          pricing: row.pricing,
          orderedAt: row.created_at,
        };
      }
    }

    // Then the open bag. `carts.status = 'open'` is what makes it the CURRENT
    // bag rather than one already checked out — a checked-out cart still holds
    // its lines, and counting those would say "in your bag" about a purchase.
    const owner = viewer.userId
      ? { column: "user_id", value: viewer.userId }
      : viewer.sessionId
        ? { column: "session_id", value: viewer.sessionId }
        : null;
    if (!owner) return NO_FULFILMENT;

    const { data: cart, error: cartError } = await db
      .from("carts")
      .select("id")
      .eq(owner.column, owner.value)
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cartError || !cart) return NO_FULFILMENT;

    const { data: line, error: lineError } = await db
      .from("cart_items")
      .select("quantity")
      .eq("cart_id", (cart as { id: string }).id)
      .eq("extraction_cache_id", extractionCacheId)
      .maybeSingle();

    if (lineError || !line) return NO_FULFILMENT;
    return { kind: "in_bag", quantity: (line as { quantity: number }).quantity };
  } catch (error) {
    logger.warn("receipt fulfilment lookup threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NO_FULFILMENT;
  }
}

/**
 * The cedi figure the customer was actually charged.
 *
 * `admin_total_ghs` wins when it is set — migration 031 exists precisely so an
 * admin can price an order the calculator could not, and that hand-entered
 * figure is the one on the invoice. Postgres `NUMERIC` arrives as a string over
 * PostgREST often enough to matter, hence the coercion.
 */
function settledTotal(
  adminTotal: number | string | null,
  pricing: OrderPricingBreakdown | null,
): number | null {
  const admin = adminTotal == null ? NaN : Number(adminTotal);
  if (Number.isFinite(admin) && admin > 0) return admin;

  const stored = pricing?.total_ghs;
  return typeof stored === "number" && Number.isFinite(stored) ? stored : null;
}
