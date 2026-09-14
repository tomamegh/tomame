export const RATE_LIMIT = {
  /** Auth endpoints (signup, login, forgot-password) */
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  /** General authenticated endpoints */
  general: { windowMs: 15 * 60 * 1000, maxRequests: 60 },
  /**
   * Admin endpoints — 200 per 15 minutes per IP, per endpoint.
   *
   * It was 20, which is a THIRD of what an ordinary signed-in customer gets on
   * `general`, and that is backwards: a customer looks at one screen, while an
   * admin works a queue, re-reads a list after every action and keeps several
   * tabs open. The v2 admin made it worse — the sidebar polls
   * `/api/admin/queue-counts` once a minute for its badges, which is 15 of the
   * 20 on its own, so a working admin would have started seeing 429s on their
   * own chrome.
   *
   * Each endpoint gets its own bucket (the key is per route), so this is a
   * ceiling on hammering ONE endpoint, not a budget across the admin. The
   * endpoints are all role-gated, so this bounds a compromised admin session
   * rather than an anonymous attacker.
   */
  admin: { windowMs: 15 * 60 * 1000, maxRequests: 200 },
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
   * "Tell us what you want" — 6 requests per hour per IP.
   *
   * Every row this writes is a job a person has to work, and the link-free path
   * accepts any URL, so the per-URL dedupe bounds nothing. Held near the waitlist
   * budget rather than `general` (60 per 15 minutes) for that reason: a script
   * on the loose limit could put 240 items an hour into the buyer's queue.
   * Six an hour is still more corrections than any real customer makes.
   */
  assisted: { windowMs: 60 * 60 * 1000, maxRequests: 6 },
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
  /**
   * Parcel photo bytes — 300 per 15 minutes per IP.
   *
   * Deliberately loose, because this is an <img src>: one journey screen is
   * three or four requests, a customer opening several of them is a dozen, and
   * a browser that re-requests on a back-navigation doubles it. The route is
   * authenticated and re-checks ownership per request, so this bounds a signed-in
   * caller scraping the bucket rather than an anonymous attacker — which is what
   * the per-request ownership check is actually for.
   */
  parcelPhotos: { windowMs: 15 * 60 * 1000, maxRequests: 300 },
} as const;

/**
 * Price-watch re-check batch.
 *
 * A re-check is a full extraction, so this job is the most
 * scraper-credit-hungry thing the platform runs. It used to be one nightly
 * sweep of 200 watches, which is a single Vercel invocation held open for
 * minutes — past the 300 s function cap, where the run is killed mid-sweep and
 * the watches it never reached simply wait another day with no way to resume.
 *
 * It is a BATCH now (migration 052): `batchSize` watches per invocation,
 * `concurrency` at a time, fired every 10 minutes by pg_cron. What stops the
 * higher frequency from multiplying scraper spend is `recheckAfterHours` — a
 * watch checked inside that window is not due, so once everybody has had their
 * turn today the runs claim nothing and return immediately. A killed run costs
 * one batch, and the next one resumes exactly where it stopped because
 * `last_checked_at` is stamped per watch, not per sweep.
 *
 * `maxConsecutiveFailures` retires a watch that has gone permanently bad (a
 * delisted product, a dead URL) instead of paying to re-fetch it forever.
 */
export const PRICE_WATCH_JOB = {
  /** Watches re-checked per invocation. Two waves of a 25 s vendor budget. */
  batchSize: 8,
  /** Concurrent extractions inside one batch. */
  concurrency: 4,
  /**
   * A watch is due again this long after its last check. Roughly daily, set
   * short of 24 h so a watch does not drift an hour later every day.
   */
  recheckAfterHours: 20,
  /** Deactivate a watch after this many consecutive failed checks. */
  maxConsecutiveFailures: 5,
} as const;

export const PASSWORD = {
  minLength: 8,
} as const;
