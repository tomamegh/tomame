import { STORES } from "./stores";
import type { Region } from "./url";
import type { ExtractionResult } from "./types";

/** Currency a region's stores list in when neither the page nor the store registry says. */
const REGION_CURRENCY: Record<Region, string> = { USA: "USD", UK: "GBP", CHINA: "CNY" };

/**
 * The currency a listing's store shipping is in: the page's own currency, else
 * the store's registered currency for that region (eBay UK → GBP), else the
 * region's. Never the gap-filled item price's USD: a customer typing a dollar
 * price does not turn a seller's £3 shipping into $3. Pure, so the admin review
 * panel labels its input with the same currency the server prices it in.
 */
export function storeShippingCurrencyOf(
  extraction: Pick<ExtractionResult, "platform"> & { product: Pick<ExtractionResult["product"], "currency"> },
  country: Region,
): string {
  if (extraction.product.currency) return extraction.product.currency;
  const store = STORES.find((s) => s.slug === extraction.platform && s.region === country);
  return store?.currency ?? REGION_CURRENCY[country];
}

/** Largest per-unit store shipping an admin may enter at review, in the listing currency. */
export const MAX_STORE_SHIPPING_PER_UNIT = 2_000;
