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
  /** Orders and groups cancelled per run. */
  orderBatchSize: 50,
} as const;
