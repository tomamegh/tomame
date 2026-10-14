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

/**
 * One shipping service a store offers to the hub (eBay: USPS Ground, FedEx
 * Home Delivery…). Kept on `product.metadata.storeShippingOptions`; the
 * cheapest is `product.store_shipping`, and the customer may pick another on
 * the quote. Costs are per unit in `currency`.
 */
export interface StoreShippingOption {
  /** Stable id the customer's choice is stored under (eBay's shippingServiceCode). */
  code: string;
  label: string;
  cost: number;
  currency: string;
  /** ISO dates of the carrier's estimated delivery window to the hub, when the store gives one. */
  eta_min: string | null;
  eta_max: string | null;
}

export const MAX_STORE_SHIPPING_CODE_LENGTH = 80;

/** The options a snapshot carries, validated; a snapshot without any is an empty list. */
export function storeShippingOptionsOf(product: { metadata?: Record<string, unknown> | null }): StoreShippingOption[] {
  const raw = product.metadata?.storeShippingOptions;
  if (!Array.isArray(raw)) return [];
  const out: StoreShippingOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const v = o as Record<string, unknown>;
    if (typeof v.code !== "string" || !v.code || typeof v.cost !== "number" || !Number.isFinite(v.cost) || v.cost < 0) continue;
    out.push({
      code: v.code.slice(0, MAX_STORE_SHIPPING_CODE_LENGTH),
      label: typeof v.label === "string" && v.label ? v.label : v.code,
      cost: Math.round(v.cost * 100) / 100,
      currency: typeof v.currency === "string" ? v.currency.toUpperCase() : "USD",
      eta_min: typeof v.eta_min === "string" ? v.eta_min : null,
      eta_max: typeof v.eta_max === "string" ? v.eta_max : null,
    });
  }
  return out;
}

/** The option a stored code names, or null when the snapshot does not offer it (then the cheapest is charged). */
export function pickStoreShippingOption(product: { metadata?: Record<string, unknown> | null }, code: string | null | undefined): StoreShippingOption | null {
  if (!code) return null;
  return storeShippingOptionsOf(product).find((o) => o.code === code) ?? null;
}
