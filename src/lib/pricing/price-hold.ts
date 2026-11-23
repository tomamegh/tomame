import type { PricingBreakdown } from "./calculator";

/**
 * The held price (Seamless Roadmap, Initiative 1; migration 121).
 *
 * Inside the rate-lock window a quoted total is honoured when it has risen by
 * no more than the cap (`price_hold_cap_ghs`, a cedi amount leadership set):
 * the customer pays what they were quoted, and the difference shows as its own
 * line, `price_hold_ghs`, so the breakdown still adds up. Above the cap nothing
 * is absorbed and `held_total_ghs` carries the quoted figure, so the screen
 * can say "was GH₵X" before anyone pays. A total that went DOWN is simply the
 * lower total.
 *
 * Store shipping is outside the hold: the customer chooses the store's
 * shipping service. `heldUnitGhs` is per unit, so a quantity change scales it.
 *
 * Pure and framework-free: the quote, the bag, order intake and the unpaid
 * re-price job all apply the same rule.
 */
export interface PriceHold {
  /** `quote_locks.held_unit_ghs`; null when the quote held nothing (a customer gap-filler). */
  heldUnitGhs: number | null;
  /** The lock's expiry, ISO. */
  expiresAt: string;
}

export function applyPriceHold(
  pricing: PricingBreakdown,
  hold: PriceHold | null,
  capGhs: number,
  now: Date = new Date(),
): PricingBreakdown {
  // A breakdown that already carries a hold is re-derived from scratch.
  const base = withoutPriceHold(pricing);
  if (!hold || hold.heldUnitGhs == null || !(hold.heldUnitGhs > 0)) return base;
  if (new Date(hold.expiresAt).getTime() <= now.getTime()) return base;
  if (base.pricing_method === "needs_review" || !(base.total_ghs > 0)) return base;

  const shippingGhs = base.store_shipping_ghs ?? 0;
  const held = round2(hold.heldUnitGhs * base.quantity);
  const current = round2(base.total_ghs - shippingGhs);
  const rise = round2(current - held);
  if (rise <= 0) return base;
  if (!(capGhs > 0) || rise > capGhs) {
    // Too big to absorb: say what was quoted, charge the new total.
    return { ...base, held_total_ghs: round2(held + shippingGhs) };
  }
  const total = round2(held + shippingGhs);
  return {
    ...base,
    price_hold_ghs: rise,
    held_total_ghs: total,
    total_ghs: total,
    total_pesewas: Math.round(total * 100),
    ...(base.total_usd != null && base.exchange_rate > 0 ? { total_usd: round2(total / base.exchange_rate) } : {}),
  };
}

/** The breakdown as priced, before any hold: the absorbed rise added back. */
export function withoutPriceHold(pricing: PricingBreakdown): PricingBreakdown {
  if (pricing.price_hold_ghs == null && pricing.held_total_ghs == null) return pricing;
  const { price_hold_ghs: absorbed = 0, held_total_ghs: _held, ...rest } = pricing;
  void _held;
  if (!(absorbed > 0)) return rest;
  const total = round2(rest.total_ghs + absorbed);
  return {
    ...rest,
    total_ghs: total,
    total_pesewas: Math.round(total * 100),
    ...(rest.total_usd != null && rest.exchange_rate > 0 ? { total_usd: round2(total / rest.exchange_rate) } : {}),
  };
}

/** The quoted per-unit total a lock holds, store shipping excluded. */
export function heldUnitFor(pricing: PricingBreakdown): number | null {
  if (pricing.pricing_method === "needs_review" || !(pricing.total_ghs > 0) || !(pricing.quantity > 0)) return null;
  // Unrounded on purpose: held × quantity must give back the quoted total exactly.
  const unit = (pricing.total_ghs - (pricing.store_shipping_ghs ?? 0)) / pricing.quantity;
  return unit > 0 ? unit : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
