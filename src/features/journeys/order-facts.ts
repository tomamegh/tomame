import { findStore } from "@/features/extraction/stores";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import type { JourneyEta } from "./types";

/**
 * Three facts every screen that shows an order reads off the row: which store
 * it came from, what it cost, and when it lands.
 *
 * Pure and framework-free, so the orders list, the order detail and the Home
 * "Your orders" section all derive them from the same code — and so Home, which
 * reads a narrow column set rather than a whole `Order`, can use them too. The
 * inputs are the columns, not the `Order` type, for that reason.
 */

/**
 * The store's registry name, falling back to what the extraction called the
 * platform. Null when the URL matches nothing we know — better a row with no
 * store than one labelled with a bare hostname the customer never typed.
 */
export function storeNameFor(productUrl: string, platform: unknown): string | null {
  const known = findStore(productUrl);
  if (known) return known.name;
  return typeof platform === "string" && platform.trim().length > 0 ? platform.trim() : null;
}

/** The admin's override when one was set, else the stored breakdown's total. */
export function orderTotalGhs(order: {
  admin_total_ghs: number | null;
  pricing: OrderPricingBreakdown | null;
}): number | null {
  if (order.admin_total_ghs != null && Number.isFinite(order.admin_total_ghs)) {
    return order.admin_total_ghs;
  }
  const total = order.pricing?.total_ghs;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

/**
 * The window an operator confirmed, else the estimate the quote showed
 * (`pricing.delivery_eta_from/to`, written pre-purchase from the region's transit
 * band). Null when the order has neither — nothing is invented from a status.
 */
export function orderEta(order: {
  eta_from?: string | null;
  eta_to?: string | null;
  estimated_delivery_date: string | null;
  pricing: OrderPricingBreakdown | null;
}): JourneyEta | null {
  if (order.eta_from || order.eta_to) {
    return { from: order.eta_from ?? null, to: order.eta_to ?? null, source: "confirmed" };
  }
  if (order.estimated_delivery_date) {
    return {
      from: order.estimated_delivery_date,
      to: order.estimated_delivery_date,
      source: "confirmed",
    };
  }
  const from = order.pricing?.delivery_eta_from ?? null;
  const to = order.pricing?.delivery_eta_to ?? null;
  return from || to ? { from, to, source: "estimated" } : null;
}
