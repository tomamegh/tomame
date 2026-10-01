import { storeShippingCurrencyOf } from "@/features/extraction/store-shipping";
import type { Order, OriginCountry } from "./types";

/**
 * The currency an order's per-unit store shipping is listed in: what it was
 * priced in, else the listing's (page → store → region). Pure, so the admin
 * review panel labels its input with the currency the server prices it in.
 */
export function orderStoreShippingCurrency(
  order: Pick<Order, "pricing" | "extraction_metadata">,
  country: OriginCountry,
): string {
  if (order.pricing?.store_shipping_currency) return order.pricing.store_shipping_currency;
  const snapshot = order.extraction_metadata;
  return storeShippingCurrencyOf(
    { platform: snapshot?.platform ?? null, product: { currency: snapshot?.product?.currency ?? null } },
    country,
  );
}

/** The per-unit store shipping an order was priced with; 0 when none was charged. */
export function orderStoreShippingPerUnit(order: Pick<Order, "pricing">): number {
  const value = order.pricing?.store_shipping;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
