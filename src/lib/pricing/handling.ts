import type { PricingBreakdown } from "./calculator";

/**
 * The handling fee as its own line (site brief, Fix 7). The admin constant
 * `handling_fee_usd` ($3) is charged once per product line on weight-priced
 * items and used to sit, unseen, inside "Freight". Every breakdown now shows it
 * separately; the total is unchanged (it is still part of `flat_rate_ghs`, which
 * every total and payment is built from).
 *
 * A breakdown stored before Fix 7 has no `handling_ghs` but carries
 * `handling_fee_usd` and the rate it was struck at, so it splits the same way.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

type HandlingFields = Pick<PricingBreakdown, "pricing_method" | "flat_rate_ghs" | "exchange_rate" | "handling_fee_usd" | "handling_ghs">;

export function handlingGhsOf(p: HandlingFields | null | undefined): number {
  if (!p || p.pricing_method !== "weight_expression") return 0;
  const stored = p.handling_ghs ?? (p.handling_fee_usd != null && p.exchange_rate > 0 ? r2(p.handling_fee_usd * p.exchange_rate) : 0);
  const value = Number.isFinite(stored) && stored > 0 ? stored : 0;
  return r2(Math.min(value, Math.max(0, p.flat_rate_ghs)));
}

/** Freight without the handling fee: what the "Freight" line shows beside a "Handling fee" line. */
export function freightExHandlingGhs(p: HandlingFields): number {
  return r2(Math.max(0, p.flat_rate_ghs - handlingGhsOf(p)));
}
