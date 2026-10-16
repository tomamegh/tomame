/**
 * Payment reconciliation (migration 059).
 *
 * Two admin-tunable durations live in `site_settings`, read once per job run;
 * the values here are the fallbacks when a row is missing or unusable, and the
 * job logs when it has to use one. Everything is minutes or hours as named.
 */
export const PAYMENT_EXPIRY_MINUTES_KEY = "payment_expiry_minutes";
export const UNPAID_ORDER_TTL_HOURS_KEY = "unpaid_order_ttl_hours";

export const PAYMENT_RECONCILIATION = {
  /**
   * A pending payment younger than this is not looked at: the customer is most
   * likely still on Paystack's page, and a verify call would only confirm that.
   */
  graceMinutes: 5,
  /** Paystack verifies per run. One call each, well inside the function budget. */
  batchSize: 20,
  /** Fallback for `site_settings.payment_expiry_minutes`. */
  defaultExpiryMinutes: 60,
  /** Fallback for `site_settings.unpaid_order_ttl_hours`. */
  defaultUnpaidOrderTtlHours: 48,
  /**
   * How long a `failed` payment keeps being re-verified. Paystack's checkout
   * stays open after a declined attempt and a "try again" on the same
   * reference can still be paid, so `failed` is not final on their side.
   * Inside the unpaid-order lifetime on purpose: a late success settles the bag
   * before the sweep can close it.
   */
  failedRecheckHours: 24,
  /** Orders and groups cancelled per run. */
  orderBatchSize: 50,
} as const;
