export const RATE_LIMIT = {
  /** Auth endpoints (signup, login, forgot-password) */
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  /** General authenticated endpoints */
  general: { windowMs: 15 * 60 * 1000, maxRequests: 60 },
  /** Admin endpoints */
  admin: { windowMs: 15 * 60 * 1000, maxRequests: 20 },
  /** Order creation — 5 requests per hour per user */
  orders: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  /** Payment initialization — 10 requests per 15 minutes */
  payments: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  /** Webhook endpoints — 100 requests per minute */
  webhooks: { windowMs: 60 * 1000, maxRequests: 100 },
  /** Product extraction — 10 requests per 10 minutes per IP. Cache hits are not counted. */
  extraction: { windowMs: 10 * 60 * 1000, maxRequests: 10 },
  /** Public waitlist signup — 5 requests per hour per IP. */
  waitlist: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  /**
   * Price-watch writes — 20 per hour per user. Each new watch costs a scraper
   * call now and one every night afterwards, so this is a cost ceiling as much
   * as an abuse one. Reads use `general`.
   */
  watches: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
  /**
   * Public FX rate lookup — 120 per 15 minutes per IP. Higher than `general`
   * because it serves a single cached row to anonymous callers, but still
   * bounded. Note the app shell does NOT come through here: it calls
   * `getFxRateQuote` in-process, so this budget is for external and client-side
   * callers only.
   */
  fxRate: { windowMs: 15 * 60 * 1000, maxRequests: 120 },
} as const;

/**
 * Daily price-watch re-check budget.
 *
 * A re-check is a full extraction, so the nightly job is the most
 * scraper-credit-hungry thing the platform runs. The job takes the
 * least-recently-checked active watches first, so a cap still gives every watch
 * a turn — it lengthens the cycle rather than starving anyone.
 *
 * `maxConsecutiveFailures` retires a watch that has gone permanently bad (a
 * delisted product, a dead URL) instead of paying to re-fetch it every night.
 */
export const PRICE_WATCH_JOB = {
  /** Watches re-checked per nightly run. */
  maxPerRun: 200,
  /** Concurrent extractions inside one run. */
  concurrency: 4,
  /** Deactivate a watch after this many consecutive failed checks. */
  maxConsecutiveFailures: 5,
} as const;

export const PASSWORD = {
  minLength: 8,
} as const;
