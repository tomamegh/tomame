import "server-only";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { logger } from "@/lib/logger";
import type { QuoteConstants } from "../types";

const KEYS = ["rate_lock_hours", "purchase_lead_days_min", "purchase_lead_days_max"] as const;

/**
 * A seeded constant is absent from `pricing_constants`. This is a
 * deploy-before-migrate bug, not a transient failure: every caller rethrows it
 * (the quote, the order and the Home trust chip all go red) instead of
 * degrading, because a "Rate locked 24h" promise with no number behind it —
 * or a lock minted with a made-up duration — must never ship quietly.
 */
export class QuoteConstantsMissingError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(`Failed to load quote constants: missing ${missing.join(", ")} in pricing_constants`);
    this.name = "QuoteConstantsMissingError";
    this.missing = missing;
  }
}

/**
 * The quote flow's three constants. Missing keys throw rather than default: the
 * "Rate locked 24h" promise on the Home screen must be the same number the lock
 * is minted with, and a silent fallback would let the two drift.
 */
/**
 * `price_hold_cap_ghs` (121): the most a quoted total may rise inside the lock
 * window and still be charged as quoted. Read apart from the required keys on
 * purpose: a missing row turns the hold off (0) with a warning rather than
 * stopping every quote, since the hold is a promise on top of a working price.
 */
export async function loadPriceHoldCap(): Promise<number> {
  const value = (await getPricingConstantsMap())["price_hold_cap_ghs"];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  logger.warn("price_hold_cap_ghs missing from pricing_constants; price hold off");
  return 0;
}

export async function loadQuoteConstants(): Promise<QuoteConstants> {
  const map = await getPricingConstantsMap();
  const read = (key: (typeof KEYS)[number]): number | null => {
    const value = map[key];
    return typeof value === "number" && !Number.isNaN(value) ? value : null;
  };
  const values = { rate_lock_hours: read(KEYS[0]), purchase_lead_days_min: read(KEYS[1]), purchase_lead_days_max: read(KEYS[2]) };
  const missing = KEYS.filter((key) => values[key] == null);
  if (missing.length > 0) throw new QuoteConstantsMissingError(missing);
  return values as QuoteConstants;
}
